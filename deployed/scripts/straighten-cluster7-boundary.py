"""
Straighten Cluster 7 cluster and Temoryan Bala community boundaries
around priority #1 (no hook / sudden bends).

Run via: propy.bat scripts/straighten-cluster7-boundary.py
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
COMMUNITY_PRE_MERGE_FC = str(BACKUP_DIR / "Cluster7_pre_merge_backup.gdb" / "BoundaryCommunity")
WGS84 = arcpy.SpatialReference(4326)

PRIORITY = {"lon": 68.867600, "lat": 36.305800, "label": "Cluster 7 priority #1"}
CLUSTER_NAME = "Cluster 7"
VILLAGE_NAME = "Temoryan Bala"

CLUSTER_CORRIDOR_METERS = 420
CLUSTER_POINT_BUFFER_METERS = 100
CLUSTER_SMOOTH_OUT_METERS = 45
CLUSTER_SMOOTH_IN_METERS = 38

VILLAGE_CORRIDOR_METERS = 280
VILLAGE_POINT_BUFFER_METERS = 100
VILLAGE_SMOOTH_OUT_METERS = 40
VILLAGE_SMOOTH_IN_METERS = 34


def backup_current_layers(backup_dir: Path):
    backup_dir.mkdir(parents=True, exist_ok=True)
    snapshot_gdb = backup_dir / "Cluster7_pre_straighten_backup.gdb"
    if snapshot_gdb.exists():
        shutil.rmtree(snapshot_gdb)
    arcpy.management.CreateFileGDB(str(backup_dir), snapshot_gdb.name)
    arcpy.management.CopyFeatures(CLUSTER_FC, str(snapshot_gdb / "BoundaryCluster"))
    arcpy.management.CopyFeatures(COMMUNITY_FC, str(snapshot_gdb / "BoundaryCommunity"))
    return str(snapshot_gdb)


def load_backup_cluster(cluster_name):
    with arcpy.da.SearchCursor(CLUSTER_BACKUP_FC, ["Name", "SHAPE@"]) as cursor:
        for name, geom in cursor:
            if name == cluster_name:
                return geom
    raise RuntimeError(f"{cluster_name} not found in cluster backup")


def load_original_village(village_name):
    with arcpy.da.SearchCursor(COMMUNITY_PRE_MERGE_FC, ["Name", "SHAPE@"]) as cursor:
        for name, geom in cursor:
            if name == village_name:
                return geom
    with arcpy.da.SearchCursor(COMMUNITY_FC, ["Name", "SHAPE@"]) as cursor:
        for name, geom in cursor:
            if name == village_name:
                return geom
    raise RuntimeError(f"{village_name} community polygon not found")


def priority_point(spatial_reference):
    point = arcpy.PointGeometry(arcpy.Point(PRIORITY["lon"], PRIORITY["lat"]), WGS84)
    if spatial_reference.factoryCode != WGS84.factoryCode:
        point = point.projectAs(spatial_reference)
    return point


def straight_extension(base_polygon, to_point, corridor_meters, point_buffer_meters, smooth_out, smooth_in):
    start = base_polygon.trueCentroid
    end = to_point.firstPoint
    line = arcpy.Polyline(
        arcpy.Array([arcpy.Point(start.X, start.Y), arcpy.Point(end.X, end.Y)]),
        base_polygon.spatialReference,
    )
    merged = base_polygon.union(line.buffer(corridor_meters)).union(to_point.buffer(point_buffer_meters))
    merged = merged.buffer(smooth_out).buffer(-smooth_in)
    return merged


def update_feature(feature_class, name_field, feature_name, new_polygon):
    with arcpy.da.UpdateCursor(feature_class, ["OBJECTID", name_field, "SHAPE@"]) as cursor:
        for row in cursor:
            if row[1] != feature_name:
                continue
            row[2] = new_polygon
            cursor.updateRow(row)
            return row[0]
    raise RuntimeError(f"Could not update {feature_name} in {feature_class}")


def main():
    if not arcpy.Exists(CLUSTER_BACKUP_FC):
        raise FileNotFoundError(f"Cluster backup not found: {CLUSTER_BACKUP_FC}")

    snapshot_gdb = backup_current_layers(BACKUP_DIR)

    cluster_base = load_backup_cluster(CLUSTER_NAME)
    village_orig = load_original_village(VILLAGE_NAME)
    point = priority_point(cluster_base.spatialReference)

    cluster_seed = cluster_base.union(village_orig)
    cluster_polygon = straight_extension(
        cluster_seed,
        point,
        CLUSTER_CORRIDOR_METERS,
        CLUSTER_POINT_BUFFER_METERS,
        CLUSTER_SMOOTH_OUT_METERS,
        CLUSTER_SMOOTH_IN_METERS,
    )

    village_polygon = straight_extension(
        village_orig,
        point,
        VILLAGE_CORRIDOR_METERS,
        VILLAGE_POINT_BUFFER_METERS,
        VILLAGE_SMOOTH_OUT_METERS,
        VILLAGE_SMOOTH_IN_METERS,
    )

    if cluster_polygon.partCount != 1 or not cluster_polygon.contains(point):
        raise RuntimeError("Cluster 7 straightened polygon failed validation")
    if village_polygon.partCount != 1 or not village_polygon.contains(point):
        raise RuntimeError("Temoryan Bala straightened polygon failed validation")

    cluster_objectid = update_feature(CLUSTER_FC, "Name", CLUSTER_NAME, cluster_polygon)
    village_objectid = update_feature(COMMUNITY_FC, "Name", VILLAGE_NAME, village_polygon)

    summary = {
        "status": "ok",
        "snapshot_gdb": snapshot_gdb,
        "cluster": {
            "name": CLUSTER_NAME,
            "objectid": cluster_objectid,
            "part_count": cluster_polygon.partCount,
            "method": "base_plus_village_plus_straight_corridor",
        },
        "village": {
            "name": VILLAGE_NAME,
            "objectid": village_objectid,
            "part_count": village_polygon.partCount,
            "method": "original_plus_straight_corridor",
        },
        "priority": PRIORITY,
    }
    manifest_path = BACKUP_DIR / "cluster7-straighten-manifest.json"
    manifest_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    main()
