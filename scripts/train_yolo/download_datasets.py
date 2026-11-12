#!/usr/bin/env python3
"""
download_datasets.py
--------------------
Downloads the 6 designated Roboflow datasets in YOLOv8 format into `datasets/`.
Reads the API key from the `ROBOFLOW_API_KEY` environment variable or prompts for it.
Skips datasets that already exist locally. If a specified version fails, automatically
falls back to the project's latest available version.

Usage:
  python download_datasets.py
"""

import getpass
import os
import sys
from pathlib import Path
from roboflow import Roboflow

# Same 6 datasets configured in train_colab.ipynb
DATASETS_TO_DOWNLOAD = [
    {"workspace": "student-card", "project": "student-card-xrkhm", "version": 1},
    {"workspace": "samples", "project": "keys-jcx6v", "version": 1},
    {"workspace": "senior-project-final-datasets", "project": "wallet-nfk4a", "version": 2},
    {"workspace": "breathless", "project": "bottle-ewqkq", "version": 8},
    {"workspace": "test-djdmx", "project": "backpack-enkb9", "version": 1},
    {"workspace": "s-workspace-gtpuo", "project": "phone-and-laptop", "version": 1},
]


def is_dataset_downloaded(dataset_dir: Path) -> bool:
    """Checks if a dataset directory already exists and contains data.yaml."""
    if not dataset_dir.exists() or not dataset_dir.is_dir():
        return False
    if (dataset_dir / "data.yaml").exists():
        return True
    # Also consider non-empty directories with split subfolders
    return any((dataset_dir / sub).exists() for sub in ("train", "valid", "val", "test"))


def get_latest_version(project) -> int:
    """Fetches the latest available version number for a Roboflow project."""
    versions_list = project.versions()
    if not versions_list:
        raise RuntimeError(f"No versions found for project '{project.name}'")

    ver_ints = []
    for v in versions_list:
        v_val = getattr(v, "version", None)
        if v_val is None and isinstance(v, dict):
            v_val = v.get("version")
        if v_val is not None:
            try:
                ver_ints.append(int(v_val))
            except ValueError:
                pass

    if ver_ints:
        return max(ver_ints)
    return versions_list[-1].version


def main():
    script_dir = Path(__file__).resolve().parent
    datasets_root = script_dir / "datasets"
    datasets_root.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print(" 📥 ROBOFLOW YOLOv8 DATASET DOWNLOADER")
    print("=" * 70)
    print(f"Destination directory: {datasets_root}\n")

    # Determine which datasets still need downloading
    pending = [
        ds for ds in DATASETS_TO_DOWNLOAD
        if not is_dataset_downloaded(datasets_root / ds["project"])
    ]

    if not pending:
        print("✅ All 6 datasets already exist in 'datasets/'. Nothing to download.")
        return

    # Read API key from environment or prompt
    api_key = os.environ.get("ROBOFLOW_API_KEY", "").strip()
    if not api_key:
        try:
            api_key = getpass.getpass("Enter your Roboflow API Key (hidden): ").strip()
        except Exception:
            api_key = input("Enter your Roboflow API Key: ").strip()

    if not api_key:
        print("❌ Error: A valid Roboflow API Key is required.", file=sys.stderr)
        sys.exit(1)

    rf = Roboflow(api_key=api_key)

    downloaded_count = 0
    skipped_count = 0
    failed_count = 0

    for item in DATASETS_TO_DOWNLOAD:
        ws = item["workspace"]
        proj_name = item["project"]
        target_version = item["version"]
        save_path = datasets_root / proj_name

        if is_dataset_downloaded(save_path):
            print(f"⏭️  Skipping [{ws}/{proj_name}] — already exists at {save_path}")
            skipped_count += 1
            continue

        print(f"\n📥 Fetching [{ws}/{proj_name}] (version {target_version})...")
        try:
            project = rf.workspace(ws).project(proj_name)
            try:
                project.version(target_version).download("yolov8", location=str(save_path))
                print(f"   ✅ Downloaded {proj_name} v{target_version}")
                downloaded_count += 1
            except Exception as ver_err:
                print(f"   ⚠️ Version {target_version} failed ({ver_err}). Falling back to latest version...")
                latest_v = get_latest_version(project)
                print(f"   🔄 Downloading latest version v{latest_v} for {proj_name}...")
                project.version(latest_v).download("yolov8", location=str(save_path))
                print(f"   ✅ Downloaded {proj_name} v{latest_v} (latest)")
                downloaded_count += 1
        except Exception as err:
            print(f"   ❌ Failed to download {ws}/{proj_name}: {err}", file=sys.stderr)
            failed_count += 1

    print("\n" + "=" * 70)
    print(" 📊 DOWNLOAD SUMMARY")
    print("=" * 70)
    print(f"Downloaded : {downloaded_count}")
    print(f"Skipped    : {skipped_count}")
    print(f"Failed     : {failed_count}")
    print("=" * 70)

    if failed_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

