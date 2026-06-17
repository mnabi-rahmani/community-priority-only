"""
Restore BoundaryCluster from a boundary-edit backup.

Run via: propy.bat scripts/restore-cluster-boundaries.py [backup_dir]
"""
import json
import sys
from pathlib import Path

import arcpy

REPO_ROOT = Path(__file__).resolve().parents[2]
ASSETS_CANDIDATES = [
    REPO_ROOT / "Assets Needed",
    REPO_ROOT / "deployed" / "Assets Needed",
]
ASSETS_DIR = next((p for p in ASSETS_CANDIDATES if (p / "Integrated Locations Database.gdb").exists()), ASSETS_CANDIDATES[0])
GDB_PATH = ASSETS_DIR / "Integrated Locations Database.gdb"
FC_PATH = str(GDB_PATH / "Facilities" / "BoundaryCluster")


def resolve_backup_dir(explicit=None):
    if explicit:
        return Path(explicit)
    backups_root = REPO_ROOT / "backups"
    candidates = sorted(backups_root.glob("boundary-edit-*"), reverse=True)
    return candidates[0] if candidates else None


def main():
    backup_dir = resolve_backup_dir(sys.argv[1] if len(sys.argv) > 1 else None)
    if backup_dir is None:
        raise RuntimeError("No backup directory found.")

    backup_fc = str(backup_dir / "BoundaryCluster_backup.gdb" / "BoundaryCluster")
    if not arcpy.Exists(backup_fc):
        raise FileNotFoundError(f"Backup feature class not found: {backup_fc}")
    if not arcpy.Exists(FC_PATH):
        raise FileNotFoundError(f"Target feature class not found: {FC_PATH}")

    arcpy.management.DeleteFeatures(FC_PATH)
    arcpy.management.Append(backup_fc, FC_PATH, "NO_TEST")

    summary = {
        "restored_from": backup_fc,
        "target": FC_PATH,
        "status": "ok",
    }
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    main()
