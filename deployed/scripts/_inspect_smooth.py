import json, arcpy
from pathlib import Path

backup = r"C:\Everything\Documents\Projects\Community Priorities Only\backups\boundary-edit-20260618-032134\BoundaryCluster_backup.gdb\BoundaryCluster"
current = r"C:\Everything\Documents\Projects\Community Priorities Only\Assets Needed\Integrated Locations Database.gdb\Facilities\BoundaryCluster"
WGS84 = arcpy.SpatialReference(4326)

POINTS = {
    "Cluster 1": (68.768552, 36.168264),
    "Cluster 5": (68.794767, 36.190527),
    "Cluster 7": (68.867600, 36.305800),
}

def part_count(g):
    return 0 if g is None else g.partCount

def min_connect_buffer(base, lon, lat):
    pt = arcpy.PointGeometry(arcpy.Point(lon, lat), WGS84).projectAs(base.spatialReference)
    for m in range(100, 2000, 25):
        u = base.union(pt.buffer(m))
        if u.partCount == 1 and u.contains(pt):
            return m, u
    return None, None

def smooth_polygon(poly, out_m, in_m):
    return poly.buffer(out_m).buffer(-in_m)

for label, fc in [("backup", backup), ("current", current)]:
    print("\n===", label, "===")
    with arcpy.da.SearchCursor(fc, ["Name", "SHAPE@"]) as cur:
        for name, geom in cur:
            if name in POINTS:
                lon, lat = POINTS[name]
                print(name, "parts", part_count(geom), "dist to pt", round(geom.distanceTo(arcpy.PointGeometry(arcpy.Point(lon,lat), WGS84).projectAs(geom.spatialReference)),1))
                if label == "backup":
                    m, u = min_connect_buffer(geom, lon, lat)
                    print("  min connect buffer", m, "parts after union", part_count(u))
                    for out, inn in [(150,130),(200,180),(250,220),(300,270)]:
                        s = smooth_polygon(u, out, inn)
                        print(f"  smooth +{out}/-{inn}: parts {part_count(s)} contains {s.contains(arcpy.PointGeometry(arcpy.Point(lon,lat), WGS84).projectAs(s.spatialReference))}")
