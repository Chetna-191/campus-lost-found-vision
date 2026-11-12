#!/usr/bin/env python3
"""
merge_datasets.py
-----------------
Merges multiple Roboflow YOLOv8-format datasets located in `datasets/` into a single,
unified YOLOv8 dataset (`merged_dataset/`).

Features:
- Remaps raw dataset classes to a unified campus lost & found schema.
- Specifically mapped for our Roboflow sources:
    1. student-card/student-card-xrkhm/1          -> "student-card" => ID Card
    2. samples/keys-jcx6v/1                       -> "keys-F8z5"    => Keys
    3. senior-project-final-datasets/wallet-nfk4a/2 -> "Wallet"      => Wallet
    4. breathless/bottle-ewqkq/8                  -> "bottle"       => Bottle
    5. test-djdmx/backpack-enkb9/1                -> "backpack"     => Backpack (drops handbag, paper bag)
    6. s-workspace-gtpuo/phone-and-laptop/1       -> "phone", "laptop" => Phone, Laptop
- Dynamically builds the unified class list ONLY from classes that actually have images/boxes
  (e.g., Book, Umbrella, Earphones are skipped without failing if they have no data).
- Counts images and bounding boxes per class.
- Warns about any class with under 100 bounding boxes.
- Preserves train / val (or valid) / test splits.
- Prefixes filenames with dataset folder name to prevent collisions.
- Generates a ready-to-train `data.yaml`.
"""

import argparse
import os
import shutil
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
import yaml

# ==============================================================================
# 1. CANONICAL TARGET CLASSES & DISPLAY ORDER
# ==============================================================================
CANONICAL_ORDER: List[str] = [
    "ID Card",
    "Keys",
    "Wallet",
    "Bottle",
    "Backpack",
    "Phone",
    "Laptop",
    "Book",
    "Umbrella",
    "Earphones",
]

# ==============================================================================
# 2. CLASS MAPPING CONFIGURATION (EDIT HERE)
# Maps raw labels found in Roboflow datasets to target class names (case-insensitive).
# Any class mapped to None or not listed here is dropped.
# ==============================================================================
CLASS_MAPPING: Dict[str, Optional[str]] = {
    # 1. student-card/student-card-xrkhm/1 -> "student-card"
    "student-card": "ID Card",
    "student card": "ID Card",
    "id-card": "ID Card",
    "id card": "ID Card",
    "id_card": "ID Card",
    "idcard": "ID Card",
    "identity card": "ID Card",

    # 2. samples/keys-jcx6v/1 -> "keys-F8z5"
    "keys-f8z5": "Keys",
    "keys": "Keys",
    "key": "Keys",
    "keychain": "Keys",

    # 3. senior-project-final-datasets/wallet-nfk4a/2 -> "Wallet"
    "wallet": "Wallet",
    "wallets": "Wallet",
    "purse": "Wallet",

    # 4. breathless/bottle-ewqkq/8 -> "bottle"
    "bottle": "Bottle",
    "bottles": "Bottle",
    "water bottle": "Bottle",
    "water-bottle": "Bottle",
    "water_bottle": "Bottle",

    # 5. test-djdmx/backpack-enkb9/1 -> "backpack", "handbag", "paper bag"
    "backpack": "Backpack",
    "backpacks": "Backpack",
    "school bag": "Backpack",
    "bag": "Backpack",
    # Explicitly dropped classes
    "handbag": None,
    "handbags": None,
    "paper bag": None,
    "paper-bag": None,
    "paper_bag": None,

    # 6. s-workspace-gtpuo/phone-and-laptop/1 -> "phone", "laptop"
    "phone": "Phone",
    "cell phone": "Phone",
    "cellphone": "Phone",
    "smartphone": "Phone",
    "mobile": "Phone",
    "laptop": "Laptop",
    "laptops": "Laptop",
    "notebook": "Laptop",
    "computer": "Laptop",

    # Other potential campus categories (if present in datasets)
    "book": "Book",
    "books": "Book",
    "umbrella": "Umbrella",
    "earphones": "Earphones",
    "headphones": "Earphones",
    "earbuds": "Earphones",
    "airpods": "Earphones",
}


def load_dataset_classes(yaml_path: Path) -> List[str]:
    """Reads class names from a Roboflow dataset data.yaml file."""
    if not yaml_path.exists():
        return []
    with open(yaml_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    names = data.get("names", [])
    if isinstance(names, dict):
        # Convert {0: 'classA', 1: 'classB'} to ordered list
        sorted_keys = sorted(names.keys(), key=lambda x: int(x))
        return [str(names[k]) for k in sorted_keys]
    elif isinstance(names, list):
        return [str(n) for n in names]
    return []


def scan_dataset(
    dataset_dir: Path
) -> List[Tuple[str, Path, Path, List[Tuple[str, str]]]]:
    """
    Scans a dataset directory and collects candidate image records.
    Returns list of tuples: (split, img_path, orig_label_path, [(target_class_name, bbox_coords_str)])
    """
    ds_name = dataset_dir.name
    yaml_path = dataset_dir / "data.yaml"
    raw_classes = load_dataset_classes(yaml_path)

    if not raw_classes:
        print(f"   ⚠️ Warning: No class names found in {yaml_path}. Skipping dataset '{ds_name}'.")
        return []

    print(f"\n📂 Scanning dataset: [{ds_name}] ...")
    print(f"   Classes declared ({len(raw_classes)}): {raw_classes}")

    # Build local class index -> target class name mapping
    local_to_target: Dict[int, Optional[str]] = {}
    for local_idx, raw_name in enumerate(raw_classes):
        clean_name = raw_name.strip().lower()
        target_name = CLASS_MAPPING.get(clean_name)
        if target_name is None:
            # Also try matching with exact stripped string
            target_name = CLASS_MAPPING.get(raw_name.strip())

        if target_name:
            local_to_target[local_idx] = target_name
            print(f"   ✓ Map: '{raw_name}' (idx {local_idx}) -> '{target_name}'")
        else:
            local_to_target[local_idx] = None
            print(f"   ✗ Drop class: '{raw_name}' (idx {local_idx})")

    split_aliases = {
        "train": ["train"],
        "val": ["val", "valid", "validation"],
        "test": ["test"]
    }

    records = []
    valid_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    for target_split, aliases in split_aliases.items():
        found_split_dir: Optional[Path] = None
        for alias in aliases:
            cand = dataset_dir / alias
            if cand.exists() and cand.is_dir():
                found_split_dir = cand
                break

        if not found_split_dir:
            continue

        img_dir = found_split_dir / "images"
        lbl_dir = found_split_dir / "labels"

        if not img_dir.exists():
            img_dir = found_split_dir
            lbl_dir = found_split_dir / "labels"

        if not img_dir.exists() or not lbl_dir.exists():
            continue

        image_files = [p for p in img_dir.iterdir() if p.suffix.lower() in valid_extensions]

        for img_path in image_files:
            label_path = lbl_dir / f"{img_path.stem}.txt"
            if not label_path.exists():
                continue

            with open(label_path, "r", encoding="utf-8") as lf:
                lines = lf.readlines()

            valid_boxes = []
            for line in lines:
                parts = line.strip().split()
                if len(parts) < 5:
                    continue
                try:
                    orig_cls_idx = int(parts[0])
                except ValueError:
                    continue

                target_class = local_to_target.get(orig_cls_idx)
                if target_class is not None:
                    bbox_str = " ".join(parts[1:])
                    valid_boxes.append((target_class, bbox_str))

            if valid_boxes:
                records.append((target_split, img_path, label_path, valid_boxes))

    return records


def main():
    parser = argparse.ArgumentParser(description="Merge Roboflow YOLOv8 datasets with dynamic class list.")
    parser.add_argument(
        "--datasets-dir",
        type=str,
        default=None,
        help="Path to folder containing Roboflow dataset directories (default: ./datasets or scripts/train_yolo/datasets)"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Path to output merged dataset directory (default: ./merged_dataset or scripts/train_yolo/merged_dataset)"
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    default_datasets_dir = script_dir / "datasets"
    default_output_dir = script_dir / "merged_dataset"

    datasets_dir = Path(args.datasets_dir).resolve() if args.datasets_dir else default_datasets_dir
    output_dir = Path(args.output_dir).resolve() if args.output_dir else default_output_dir

    print("=" * 72)
    print(" 🛠️  ROBOFLOW YOLOv8 DATASET MERGER & DYNAMIC CLASS REMAPPER")
    print("=" * 72)
    print(f"Datasets source path: {datasets_dir}")
    print(f"Output merged path  : {output_dir}")

    if not datasets_dir.exists():
        print(f"\n❌ Error: Datasets folder '{datasets_dir}' does not exist.")
        print(f"Please create '{datasets_dir}' and download your Roboflow dataset folders into it.")
        sys.exit(1)

    # 1. Discover subdirectories in datasets_dir
    subdirs = [p for p in datasets_dir.iterdir() if p.is_dir() and not p.name.startswith(".")]

    if not subdirs:
        if (datasets_dir / "data.yaml").exists():
            subdirs = [datasets_dir]
        else:
            print(f"No dataset subdirectories found inside {datasets_dir}.")
            sys.exit(1)

    # 2. Pass 1: Scan all datasets and collect all valid records
    all_records = []
    class_box_counts: Dict[str, int] = {}
    class_image_sets: Dict[str, Set[str]] = {}
    total_datasets_processed = 0

    for subdir in subdirs:
        ds_records = scan_dataset(subdir)
        if ds_records:
            total_datasets_processed += 1
            for split, img_path, lbl_path, boxes in ds_records:
                unique_img_id = f"{subdir.name}_{img_path.name}"
                all_records.append((subdir.name, split, img_path, boxes))
                for target_cls, _ in boxes:
                    class_box_counts[target_cls] = class_box_counts.get(target_cls, 0) + 1
                    if target_cls not in class_image_sets:
                        class_image_sets[target_cls] = set()
                    class_image_sets[target_cls].add(unique_img_id)

    if not all_records:
        print("\n❌ Error: No valid annotations matching the class mappings were found.")
        sys.exit(1)

    # 3. Dynamic Unified Class List Construction
    # Only include classes that actually have > 0 bounding boxes/images.
    # Preserve canonical ordering among active classes.
    active_classes = [c for c in CANONICAL_ORDER if class_box_counts.get(c, 0) > 0]
    # Add any extra active class not in CANONICAL_ORDER
    extra_active = [c for c in sorted(class_box_counts.keys()) if c not in CANONICAL_ORDER and class_box_counts[c] > 0]
    active_classes.extend(extra_active)

    unified_class_to_idx = {cls_name: idx for idx, cls_name in enumerate(active_classes)}

    print("\n" + "=" * 72)
    print(f" 📋 DYNAMIC UNIFIED CLASS LIST ({len(active_classes)} active classes):")
    for idx, c in enumerate(active_classes):
        print(f"    Class {idx}: {c}")

    # Note skipped classes
    skipped_classes = [c for c in CANONICAL_ORDER if class_box_counts.get(c, 0) == 0]
    if skipped_classes:
        print(f" ℹ️  Skipped classes (no data in provided datasets): {', '.join(skipped_classes)}")
    print("=" * 72)

    # 4. Pass 2: Write merged images, updated labels, and data.yaml
    if output_dir.exists():
        print(f"\nClearing previous output directory: {output_dir} ...")
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    split_counts = {"train": 0, "val": 0, "test": 0}

    for ds_name, split, img_path, boxes in all_records:
        out_img_dir = output_dir / split / "images"
        out_lbl_dir = output_dir / split / "labels"
        out_img_dir.mkdir(parents=True, exist_ok=True)
        out_lbl_dir.mkdir(parents=True, exist_ok=True)

        new_filename_base = f"{ds_name}_{img_path.name}"
        dest_img_path = out_img_dir / new_filename_base
        dest_lbl_path = out_lbl_dir / f"{ds_name}_{img_path.stem}.txt"

        # Copy image file
        shutil.copy2(img_path, dest_img_path)

        # Write remapped label lines with unified class index
        remapped_lines = []
        for target_cls, bbox_str in boxes:
            new_idx = unified_class_to_idx[target_cls]
            remapped_lines.append(f"{new_idx} {bbox_str}")

        with open(dest_lbl_path, "w", encoding="utf-8") as out_f:
            out_f.write("\n".join(remapped_lines) + "\n")

        split_counts[split] = split_counts.get(split, 0) + 1

    # 5. Generate data.yaml
    yaml_content = {
        "path": str(output_dir.resolve()).replace("\\", "/"),
        "train": "train/images",
        "val": "val/images",
        "test": "test/images" if split_counts.get("test", 0) > 0 else "val/images",
        "nc": len(active_classes),
        "names": {idx: name for idx, name in enumerate(active_classes)}
    }

    yaml_dest = output_dir / "data.yaml"
    with open(yaml_dest, "w", encoding="utf-8") as yf:
        yaml.dump(yaml_content, yf, default_flow_style=False, sort_keys=False)

    # 6. Print Summary, Counts, and Under-100 Warnings
    print("\n" + "=" * 72)
    print(" ✅ DATASET MERGE COMPLETED SUCCESSFULLY")
    print("=" * 72)
    print(f"Total datasets merged   : {total_datasets_processed}")
    print(f"Total images in dataset : {sum(split_counts.values())}")
    print(f"  - Train images        : {split_counts.get('train', 0)}")
    print(f"  - Validation images   : {split_counts.get('val', 0)}")
    print(f"  - Test images         : {split_counts.get('test', 0)}")
    print("\n" + "-" * 72)
    print(f"{'Class Name':<16} | {'Class ID':<10} | {'Images':<12} | {'Bounding Boxes':<16}")
    print("-" * 72)

    under_100_warnings = []
    for cls_name in active_classes:
        cls_id = unified_class_to_idx[cls_name]
        boxes = class_box_counts.get(cls_name, 0)
        imgs = len(class_image_sets.get(cls_name, set()))
        print(f"{cls_name:<16} | {cls_id:<10} | {imgs:<12} | {boxes:<16}")
        if boxes < 100:
            under_100_warnings.append((cls_name, boxes))

    print("-" * 72)
    print(f"Config YAML written to  : {yaml_dest}")

    if under_100_warnings:
        print("\n⚠️  CLASS BALANCE WARNINGS (< 100 bounding boxes):")
        for cls_name, count in under_100_warnings:
            print(f"   • Class '{cls_name}': only {count} bounding boxes. Consider supplementing with more Roboflow samples to avoid underfitting.")
    else:
        print("\n✨ All active classes have at least 100 bounding boxes.")

    print("=" * 72)


if __name__ == "__main__":
    main()
