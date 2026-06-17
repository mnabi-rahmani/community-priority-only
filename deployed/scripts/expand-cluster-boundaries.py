"""
Expand BoundaryCluster polygons in Integrated Locations Database.gdb
so infrastructure priority points fall inside their assigned cluster.

Run via: propy.bat scripts/expand-cluster-boundaries.py
"""
import json
import shutil
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
WGS84 = arcpy.SpatialReference(4326)

POINTS_TO_INCLUDE = [
    {"cluster": "Cluster 1", "lon": 68.768552, "lat": 36.168264, "label": "priority #7 bridge"},
    {"cluster": "Cluster 5", "lon": 68.794767, "lat": 36.190527, "label": "priority #5 sub-health center"},
    {"cluster": "Cluster 7", "lon": 68.867600, "lat": 36.305800, "label": "priority #1 water supply"},
]

BUFFER_METERS = 350


def resolve_backup_dir():
    backups_root = REPO_ROOT / "backups"
    if not backups_root.exists():
        return None
    candidates = sorted(backups_root.glob("boundary-edit-*"), reverse=True)
    return candidates[0] if candidates else None


def backup_boundary_cluster(backup_dir: Path):
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_gdb = backup_dir / "BoundaryCluster_backup.gdb"
    if backup_gdb.exists():
        shutil.rmtree(backup_gdb)
    arcpy.management.CreateFileGDB(str(backup_dir), backup_gdb.name)
    backup_fc = backup_gdb / "BoundaryCluster"
    arcpy.management.CopyFeatures(str(FC_PATH), str(backup_fc))
    return str(backup_fc)


def point_inside(polygon, lon, lat):
    point = arcpy.PointGeometry(arcpy.Point(lon, lat), WGS84)
    if polygon.spatialReference.factoryCode != WGS84.factoryCode:
        point = point.projectAs(polygon.spatialReference)
    return polygon.contains(point)


def expand_polygon(polygon, lon, lat, buffer_meters):
    point = arcpy.PointGeometry(arcpy.Point(lon, lat), WGS84)
    if polygon.spatialReference.factoryCode != polygon.spatialReference.factoryCode:
        pass
    if polygon.spatialReference.factoryCode != WGS84.factoryCode:
        point = point.projectAs(polygon.spatialReference)
    buffered = point.buffer(buffer_meters)
    return polygon.union(buffered)


def main():
    if not GDB_PATH.exists():
        raise FileNotFoundError(f"Geodatabase not found: {GDB_PATH}")
    if not arcpy.Exists(FC_PATH):
        raise FileNotFoundError(f"BoundaryCluster not found: {FC_PATH}")

    backup_dir = resolve_backup_dir()
    if backup_dir is None:
        raise RuntimeError("No backups/boundary-edit-* directory found.")

    backup_fc = backup_boundary_cluster(backup_dir)
    targets = {item["cluster"]: item for item in POINTS_TO_INCLUDE}
    results = []

    with arcpy.da.UpdateCursor(str(FC_PATH), ["OBJECTID", "Name", "SHAPE@"]) as cursor:
        for row in cursor:
            name = row[1]
            if name not in targets:
                continue

            item = targets[name]
            polygon = row[2]
            lon, lat = item["lon"], item["lat"]

            if point_inside(polygon, lon, lat):
                results.append({
                    "cluster": name,
                    "objectid": row[0],
                    "action": "skipped",
                    "reason": "point already inside boundary",
                    "label": item["label"],
                })
                continue

            row[2] = expand_polygon(polygon, lon, lat, BUFFER_METERS)
            cursor.updateRow(row)
            results.append({
                "cluster": name,
                "objectid": row[0],
                "action": "expanded",
                "buffer_meters": BUFFER_METERS,
                "label": item["label"],
                "lon": lon,
                "lat": lat,
            })

    summary = {
        "gdb": str(GDB_PATH),
        "feature_class": str(FC_PATH),
        "backup_fc": backup_fc,
        "backup_dir": str(backup_dir),
        "results": results,
    }
    print(json.dumps(summary, indent=2))

    manifest_path = backup_dir / "boundary-edit-manifest.json"
    manifest_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


if __name__ == "__main__":
    main()
