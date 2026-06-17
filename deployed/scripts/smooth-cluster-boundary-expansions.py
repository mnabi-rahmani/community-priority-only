"""
Re-expand Cluster 1, 5, and 7 boundaries with smooth rounded merges
(no corridor fingers or sharp extrusions).

Run via: propy.bat scripts/smooth-cluster-boundary-expansions.py
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

EXPANSIONS = [
    {
        "cluster": "Cluster 1",
        "lon": 68.768552,
        "lat": 36.168264,
        "connect_buffer_m": 200,
        "smooth_out_m": 200,
        "smooth_in_m": 180,
    },
    {
        "cluster": "Cluster 5",
        "lon": 68.794767,
        "lat": 36.190527,
        "connect_buffer_m": 175,
        "smooth_out_m": 200,
        "smooth_in_m": 180,
    },
    {
        "cluster": "Cluster 7",
        "lon": 68.867600,
        "lat": 36.305800,
        "include_village": "Temoryan Bala",
        "connect_buffer_m": 0,
        "smooth_out_m": 200,
        "smooth_in_m": 180,
    },
]


def backup_current_cluster_layer(backup_dir: Path):
    backup_dir.mkdir(parents=True, exist_ok=True)
    snapshot_gdb = backup_dir / "BoundaryCluster_pre_smooth_backup.gdb"
    if snapshot_gdb.exists():
        shutil.rmtree(snapshot_gdb)
    arcpy.management.CreateFileGDB(str(backup_dir), snapshot_gdb.name)
    arcpy.management.CopyFeatures(CLUSTER_FC, str(snapshot_gdb / "BoundaryCluster"))
    return str(snapshot_gdb)


def load_backup_cluster(cluster_name):
    with arcpy.da.SearchCursor(CLUSTER_BACKUP_FC, ["Name", "SHAPE@"]) as cursor:
        for name, geom in cursor:
            if name == cluster_name:
                return geom
    raise RuntimeError(f"{cluster_name} not found in backup feature class")


def load_village_polygon(village_name):
    with arcpy.da.SearchCursor(COMMUNITY_FC, ["Name", "SHAPE@"]) as cursor:
        for name, geom in cursor:
            if name == village_name:
                return geom
    raise RuntimeError(f"{village_name} community polygon not found")


def priority_point(lon, lat, spatial_reference):
    point = arcpy.PointGeometry(arcpy.Point(lon, lat), WGS84)
    if spatial_reference.factoryCode != WGS84.factoryCode:
        point = point.projectAs(spatial_reference)
    return point


def smooth_polygon(polygon, out_meters, in_meters):
    return polygon.buffer(out_meters).buffer(-in_meters)


def build_cluster_polygon(config):
    base = load_backup_cluster(config["cluster"])
    point = priority_point(config["lon"], config["lat"], base.spatialReference)

    merged = base
    if config.get("include_village"):
        merged = merged.union(load_village_polygon(config["include_village"]))

    if config["connect_buffer_m"] > 0:
        merged = merged.union(point.buffer(config["connect_buffer_m"]))
    elif not merged.contains(point):
        merged = merged.union(point.buffer(150))

    merged = smooth_polygon(merged, config["smooth_out_m"], config["smooth_in_m"])

    if merged.partCount != 1:
        raise RuntimeError(f"{config['cluster']} is still multipart after smoothing ({merged.partCount} parts)")
    if not merged.contains(point):
        raise RuntimeError(f"{config['cluster']} does not contain priority point after smoothing")
    return merged


def update_cluster_polygon(cluster_name, new_polygon):
    updated = False
    objectid = None
    with arcpy.da.UpdateCursor(CLUSTER_FC, ["OBJECTID", "Name", "SHAPE@"]) as cursor:
        for row in cursor:
            if row[1] != cluster_name:
                continue
            row[2] = new_polygon
            cursor.updateRow(row)
            objectid = row[0]
            updated = True
            break
    if not updated:
        raise RuntimeError(f"Could not update {cluster_name}")
    return objectid


def main():
    if not GDB_PATH.exists():
        raise FileNotFoundError(f"Geodatabase not found: {GDB_PATH}")
    if not arcpy.Exists(CLUSTER_BACKUP_FC):
        raise FileNotFoundError(f"Cluster backup not found: {CLUSTER_BACKUP_FC}")

    snapshot_gdb = backup_current_cluster_layer(BACKUP_DIR)
    results = []

    for config in EXPANSIONS:
        polygon = build_cluster_polygon(config)
        objectid = update_cluster_polygon(config["cluster"], polygon)
        results.append(
            {
                "cluster": config["cluster"],
                "objectid": objectid,
                "part_count": polygon.partCount,
                "contains_priority": True,
                "method": "village_union_smooth" if config.get("include_village") else "buffer_union_smooth",
            }
        )

    summary = {
        "status": "ok",
        "snapshot_gdb": snapshot_gdb,
        "results": results,
    }
    manifest_path = BACKUP_DIR / "boundary-smooth-manifest.json"
    manifest_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    main()
