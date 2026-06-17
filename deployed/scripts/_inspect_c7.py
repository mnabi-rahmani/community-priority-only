import arcpy
backup = r"C:\Everything\Documents\Projects\Community Priorities Only\backups\boundary-edit-20260618-032134\BoundaryCluster_backup.gdb\BoundaryCluster"
community = r"C:\Everything\Documents\Projects\Community Priorities Only\Assets Needed\Integrated Locations Database.gdb\Facilities\BoundaryCommunity"
WGS84 = arcpy.SpatialReference(4326)
pt = arcpy.PointGeometry(arcpy.Point(68.867600, 36.305800), WGS84)
with arcpy.da.SearchCursor(backup, ["Name","SHAPE@"]) as c:
    for n,g in c:
        if n=="Cluster 7": base=g
with arcpy.da.SearchCursor(community, ["Name","SHAPE@"]) as c:
    for n,g in c:
        if n=="Temoryan Bala": tb=g
ptp = pt.projectAs(base.spatialReference)
merged = base.union(tb)
print("contains", merged.contains(ptp))
for m in [0,100,150,200,250,300]:
    g = merged if m==0 else merged.union(ptp.buffer(m))
    s = g.buffer(200).buffer(-180)
    print("buf",m,"contains",s.contains(ptp),"parts",s.partCount,"ratio",round(s.area/base.area,3))
