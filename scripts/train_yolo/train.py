#!/usr/bin/env python3
"""
train.py
--------
Fine-tunes YOLOv8n (or custom base model) on the merged campus lost & found dataset.
Supports partial dataset fractions (--fraction), resuming interrupted runs (--resume),
automatic CUDA/CPU detection, and prints per-class mAP50 evaluation across ALL classes.
Copies the resulting `best.pt` to `ai-service/models/campus_best.pt`.

Usage:
  python train.py --epochs 50 --imgsz 640 --workers 2
  python train.py --epochs 50 --fraction 0.5
  python train.py --resume
"""

import argparse
import shutil
import sys
from pathlib import Path
import torch
from ultralytics import YOLO


def parse_arguments():
    script_dir = Path(__file__).resolve().parent
    default_yaml = script_dir / "merged_dataset" / "data.yaml"
    default_out_model = script_dir.parent.parent / "ai-service" / "models" / "campus_best.pt"

    parser = argparse.ArgumentParser(description="Fine-tune YOLOv8 on merged campus dataset.")
    parser.add_argument(
        "--data",
        type=str,
        default=str(default_yaml),
        help=f"Path to data.yaml (default: {default_yaml})"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="yolov8n.pt",
        help="Base pretrained model weights (default: yolov8n.pt)"
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=50,
        help="Number of training epochs (default: 50)"
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=640,
        help="Image input resolution in pixels (default: 640)"
    )
    parser.add_argument(
        "--batch",
        type=int,
        default=16,
        help="Batch size (default: 16, use -1 for auto-batch)"
    )
    parser.add_argument(
        "--fraction",
        type=float,
        default=1.0,
        help="Fraction of dataset to train on (0.0 to 1.0, default: 1.0)"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=2,
        help="Dataloader worker threads (default: 2 for Windows compatibility)"
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume training from the last run's weights/last.pt"
    )
    parser.add_argument(
        "--device",
        type=str,
        default=None,
        help="Training device (e.g., '0', 'cpu', default: auto-detect GPU 0 if CUDA available else cpu)"
    )
    parser.add_argument(
        "--output-model",
        type=str,
        default=str(default_out_model),
        help=f"Destination path for best.pt (default: {default_out_model})"
    )
    parser.add_argument(
        "--project",
        type=str,
        default=str(script_dir / "runs"),
        help="Project directory for train outputs"
    )
    parser.add_argument(
        "--name",
        type=str,
        default="campus_yolo_run",
        help="Name of run experiment folder"
    )
    return parser.parse_args()


def main():
    args = parse_arguments()

    data_yaml_path = Path(args.data).resolve()
    output_model_path = Path(args.output_model).resolve()
    run_dir = Path(args.project).resolve() / args.name

    # Auto-detect GPU (use device 0 if CUDA is available, else cpu)
    if args.device is None:
        device = 0 if torch.cuda.is_available() else "cpu"
    else:
        device = int(args.device) if args.device.isdigit() else args.device

    device_desc = torch.cuda.get_device_name(0) if torch.cuda.is_available() and device != "cpu" else "CPU"

    print("=" * 70)
    print(" 🚀 CAMPUS LOST & FOUND — YOLOv8 FINE-TUNING PIPELINE")
    print("=" * 70)
    print(f"Dataset YAML       : {data_yaml_path}")
    print(f"Base Pretrained    : {args.model}")
    print(f"Epochs             : {args.epochs}")
    print(f"Image Resolution   : {args.imgsz}x{args.imgsz}")
    print(f"Batch Size         : {args.batch}")
    print(f"Dataset Fraction   : {args.fraction}")
    print(f"Workers            : {args.workers}")
    print(f"Resume Last Run    : {args.resume}")
    print(f"Compute Device     : {device} ({device_desc})")
    print(f"Target Output Model: {output_model_path}")
    print("=" * 70)

    if not args.resume and not data_yaml_path.exists():
        print(f"\n❌ Error: Dataset config '{data_yaml_path}' not found.")
        print("Please run `python download_datasets.py` and `python merge_datasets.py` first.")
        sys.exit(1)

    # 1. Initialize Model (either from last.pt when resuming, or base weights)
    if args.resume:
        last_pt_path = run_dir / "weights" / "last.pt"
        if not last_pt_path.exists():
            print(f"\n❌ Error: Cannot resume — '{last_pt_path}' does not exist.")
            sys.exit(1)
        print(f"\n[Step 1/3] Resuming training from {last_pt_path}...")
        model = YOLO(str(last_pt_path))
        train_kwargs = {
            "resume": True,
            "device": device,
            "workers": args.workers,
        }
    else:
        print(f"\n[Step 1/3] Initializing base YOLO model ({args.model})...")
        model = YOLO(args.model)
        train_kwargs = {
            "data": str(data_yaml_path),
            "epochs": args.epochs,
            "imgsz": args.imgsz,
            "batch": args.batch,
            "fraction": args.fraction,
            "workers": args.workers,
            "device": device,
            "project": str(Path(args.project).resolve()),
            "name": args.name,
            "exist_ok": True,
            "save": True,
            "plots": True,
            "verbose": True,
        }

    # 2. Train Model
    print(f"\n[Step 2/3] Running training...")
    try:
        model.train(**train_kwargs)
    except Exception as e:
        print(f"\n❌ Training encountered an error: {e}")
        sys.exit(1)

    # 3. Locate best.pt and copy to ai-service/models/campus_best.pt
    best_weights_path = run_dir / "weights" / "best.pt"
    if not best_weights_path.exists():
        last_weights = run_dir / "weights" / "last.pt"
        if last_weights.exists():
            print("⚠️ Notice: best.pt not found; falling back to last.pt")
            best_weights_path = last_weights
        else:
            print(f"❌ Error: Trained weights not found in {run_dir / 'weights'}")
            sys.exit(1)

    output_model_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best_weights_path, output_model_path)
    print(f"\n✨ Copied best weights:")
    print(f"   From: {best_weights_path}")
    print(f"   To  : {output_model_path}")

    # 4. Evaluation & Per-Class mAP50 Reporting (Iterating over ALL names)
    print("\n[Step 3/3] Evaluating best model and computing per-class mAP50 for ALL classes...")
    best_model = YOLO(str(output_model_path))
    val_results = best_model.val(data=str(data_yaml_path), split="val", device=device, workers=args.workers)

    print("\n" + "=" * 65)
    print(" 📊 VALIDATION PERFORMANCE EVALUATION (PER-CLASS mAP50)")
    print("=" * 65)
    print(f"{'Class Name':<20} | {'mAP@50':<12} | {'mAP@50-95':<12}")
    print("-" * 65)

    names = val_results.names or {}
    ap_class_index = [int(c) for c in getattr(val_results.box, "ap_class_index", [])]
    ap50_arr = list(getattr(val_results.box, "ap50", []))
    all_ap = getattr(val_results.box, "all_ap", None)

    # Map each class ID present in validation results to its mAP@50 and mAP@50-95
    ap50_by_cls = {}
    map50_95_by_cls = {}
    for pos, cls_idx in enumerate(ap_class_index):
        if pos < len(ap50_arr):
            ap50_by_cls[cls_idx] = float(ap50_arr[pos])
        if all_ap is not None and pos < len(all_ap):
            map50_95_by_cls[cls_idx] = float(all_ap[pos].mean())

    # Iterate over ALL declared classes in names so none (e.g. Laptop) are ever skipped
    for idx in sorted(names.keys()):
        cls_name = names[idx]
        if idx in ap50_by_cls:
            ap50_str = f"{ap50_by_cls[idx] * 100:>10.2f}%"
            map_val = map50_95_by_cls.get(idx)
            map_str = f"{map_val * 100:>10.2f}%" if map_val is not None else f"{'N/A':>11}"
        else:
            ap50_str = f"{'N/A (0 val)':>11}"
            map_str = f"{'N/A (0 val)':>11}"
        print(f"{cls_name:<20} | {ap50_str} | {map_str}")

    print("-" * 65)
    overall_map50 = (getattr(val_results.box, "map50", 0.0) or 0.0) * 100
    overall_map = (getattr(val_results.box, "map", 0.0) or 0.0) * 100
    print(f"{'OVERALL (Mean)':<20} | {overall_map50:>10.2f}% | {overall_map:>10.2f}%")
    print("=" * 65)
    print(f"\n🎉 Model ready for deployment! Weights saved at:")
    print(f"   {output_model_path}")
    print("   Restart the ai-service to load the custom model automatically.")


if __name__ == "__main__":
    main()
