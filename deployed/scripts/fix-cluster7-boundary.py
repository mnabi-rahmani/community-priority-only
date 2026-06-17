"""
Merge Cluster 7 into a single connected polygon and extend Temoryan Bala
community boundary to include priority #1 with a blended corridor.

Run via: propy.bat scripts/fix-cluster7-boundary.py
"""
import json
import shutil
from pathlib import Path

import arcpy

REPO_ROOT = Path(__file__).resolve().parents[2]
ASSETS_DIR = REPO_ROOT / "Assets Needed"
GDB_PATH = ASSETS_DIR / "Integrated Locations Database.gdb"
CLUSTER_FC = str(GDB_PATH / "Facilities" / "BoundaryCluster")
COMMUNITY_FC = str(GDB_PATH / "Facilities" / "BoundaryCommunity")
BACKUP_DIR = REPO_ROOT / "backups" / "boundary-edit-20260618-032134"
CLUSTER_BACKUP_FC = str(BACKUP_DIR / "BoundaryCluster_backup.gdb" / "BoundaryCluster")
WGS84 = arcpy.SpatialReference(4326)

PRIORITY = {"lon": 68.867600, "lat": 36.305800, "label": "Cluster 7 priority #1"}
VILLAGE_NAME = "Temoryan Bala"
CLUSTER_NAME = "Cluster 7"

CLUSTER_CORRIDOR_METERS = 250
CLUSTER_POINT_BUFFER_METERS = 120
CLUSTER_SMOOTH_OUT_METERS = 80
CLUSTER_SMOOTH_IN_METERS = 60

VILLAGE_CORRIDOR_METERS = 180
VILLAGE_POINT_BUFFER_METERS = 100
VILLAGE_SMOOTH_OUT_METERS = 60
VILLAGE_SMOOTH_IN_METERS = 45


def backup_current_polygons(backup_dir: Path):
    backup_dir.mkdir(parents=True, exist_ok=True)
    snapshot_gdb = backup_dir / "Cluster7_pre_merge_backup.gdb"
    if snapshot_gdb.exists():
        shutil.rmtree(snapshot_gdb)
    arcpy.management.CreateFileGDB(str(backup_dir), snapshot_gdb.name)
    arcpy.management.CopyFeatures(CLUSTER_FC, str(snapshot_gdb / "BoundaryCluster"))
    arcpy.management.CopyFeatures(COMMUNITY_FC, str(snapshot_gdb / "BoundaryCommunity"))
    return str(snapshot_gdb)


def priority_point(spatial_reference):
    point = arcpy.PointGeometry(arcpy.Point(PRIORITY["lon"], PRIORITY["lat"]), WGS84)
    if spatial_reference.factoryCode != WGS84.factoryCode:
        point = point.projectAs(spatial_reference)
    return point


def corridor_polygon(from_geom, to_point, width_meters):
    start = from_geom.trueCentroid
    end = to_point.firstPoint
    line = arcpy.Polyline(
        arcpy.Array([arcpy.Point(start.X, start.Y), arcpy.Point(end.X, end.Y)]),
        from_geom.spatialReference,
    )
    return line.buffer(width_meters)


def smooth_polygon(polygon, out_meters, in_meters):
    return polygon.buffer(out_meters).buffer(-in_meters)


def load_backup_cluster():
    with arcpy.da.SearchCursor(CLUSTER_BACKUP_FC, ["Name", "SHAPE@"]) as cursor:
        for name, geom in cursor:
            if name == CLUSTER_NAME:
                return geom
    raise RuntimeError(f"{CLUSTER_NAME} not found in backup feature class")


def load_village_polygon():
    with arcpy.da.SearchCursor(COMMUNITY_FC, ["Name", "SHAPE@"]) as cursor:
        for name, geom in cursor:
            if name == VILLAGE_NAME:
                return geom
    raise RuntimeError(f"{VILLAGE_NAME} community polygon not found")


def build_cluster_polygon():
    original_cluster = load_backup_cluster()
    village = load_village_polygon()
    point = priority_point(original_cluster.spatialReference)

    merged = original_cluster.union(village)
    merged = merged.union(corridor_polygon(village, point, CLUSTER_CORRIDOR_METERS))
    merged = merged.union(point.buffer(CLUSTER_POINT_BUFFER_METERS))
    merged = smooth_polygon(merged, CLUSTER_SMOOTH_OUT_METERS, CLUSTER_SMOOTH_IN_METERS)

    if merged.partCount != 1:
        raise RuntimeError(f"{CLUSTER_NAME} is still multipart after merge ({merged.partCount} parts)")
    if not merged.contains(point):
        raise RuntimeError(f"{CLUSTER_NAME} does not contain priority point after merge")
    return merged


def build_village_polygon():
    village = load_village_polygon()
    point = priority_point(village.spatialReference)

    merged = village.union(corridor_polygon(village, point, VILLAGE_CORRIDOR_METERS))
    merged = merged.union(point.buffer(VILLAGE_POINT_BUFFER_METERS))
    merged = smooth_polygon(merged, VILLAGE_SMOOTH_OUT_METERS, VILLAGE_SMOOTH_IN_METERS)

    if merged.partCount != 1:
        raise RuntimeError(f"{VILLAGE_NAME} is still multipart after merge ({merged.partCount} parts)")
    if not merged.contains(point):
        raise RuntimeError(f"{VILLAGE_NAME} does not contain priority point after merge")
    return merged


def update_feature_class(feature_class, name_field, feature_name, new_polygon):
    updated = False
    with arcpy.da.UpdateCursor(feature_class, ["OBJECTID", name_field, "SHAPE@"]) as cursor:
        for row in cursor:
            if row[1] != feature_name:
                continue
            row[2] = new_polygon
            cursor.updateRow(row)
            updated = True
            objectid = row[0]
            break
    if not updated:
        raise RuntimeError(f"Could not update {feature_name} in {feature_class}")
    return objectid


def main():
    if not GDB_PATH.exists():
        raise FileNotFoundError(f"Geodatabase not found: {GDB_PATH}")
    if not arcpy.Exists(CLUSTER_BACKUP_FC):
        raise FileNotFoundError(f"Cluster backup not found: {CLUSTER_BACKUP_FC}")

    snapshot_gdb = backup_current_polygons(BACKUP_DIR)
    cluster_polygon = build_cluster_polygon()
    village_polygon = build_village_polygon()

    cluster_objectid = update_feature_class(CLUSTER_FC, "Name", CLUSTER_NAME, cluster_polygon)
    village_objectid = update_feature_class(COMMUNITY_FC, "Name", VILLAGE_NAME, village_polygon)

    summary = {
        "status": "ok",
        "snapshot_gdb": snapshot_gdb,
        "cluster": {
            "name": CLUSTER_NAME,
            "objectid": cluster_objectid,
            "part_count": cluster_polygon.partCount,
            "contains_priority": True,
        },
        "village": {
            "name": VILLAGE_NAME,
            "objectid": village_objectid,
            "part_count": village_polygon.partCount,
            "contains_priority": True,
        },
        "priority": PRIORITY,
    }
    manifest_path = BACKUP_DIR / "cluster7-merge-manifest.json"
    manifest_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    main()
