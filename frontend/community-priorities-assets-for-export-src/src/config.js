window.COMMUNITY_PRIORITIES_CONFIG = {
  displayMode: "infrastructure",
  priorityCountLabel: "infrastructure priorities",
  databaseLayerLabel: "Integrated Locations Database layers",
  prioritiesGlobal: "INFRASTRUCTURE_PRIORITIES",
  filtersGlobal: "INFRASTRUCTURE_FILTERS",
  areaPhotosGlobal: "INFRASTRUCTURE_AREA_PHOTOS",
  areaPhotoRadiusMeters: 100,
  mapId: "community-priorities-and-assets-for-export",
  enableMapExport: true,
  exportPhotoCallouts: [
    {
      photoFile: "Laqai Ha Secondry School 2.jpg",
      label: "School",
      targetLat: 36.171174808000046,
      targetLon: 68.76830471100004,
      targetLayerId: "schools"
    }
  ],
  includedLayerIds: [
    "boundary_cluster",
    "boundary_community",
    "bridges",
    "culverts",
    "main_roads",
    "minor_roads",
    "madrassas",
    "schools",
    "cell_towers",
    "mosques",
    "oil_tanks",
    "shops_markets",
    "teera",
    "zahoo_mula_qudrat",
    "flood_ways",
    "protection_walls",
    "bhc",
    "chc",
    "mht",
    "canals",
    "shelter_construction",
    "water_intakes",
    "water_karez",
    "water_network",
    "water_storage",
    "water_wells"
  ],
  navItems: [
    {
      id: "cluster-priorities-only",
      label: "Cluster Priorities Only",
      href: "/cluster-priorities-map/map.htm"
    },
    {
      id: "cluster-priorities-and-assets",
      label: "Cluster Priorities and Assets",
      href: "/cluster-priorities-assets-map/map.htm"
    },
    {
      id: "community-priorities-and-assets-for-export",
      label: "Community Priorities and Assets for Export",
      href: "/community-priorities-assets-for-export-map/map.htm"
    }
  ],
  priorityPhotoBaseUrl: "",
  authApiBaseUrl: "https://tfqmwiadc8.execute-api.us-east-1.amazonaws.com",
  allowedAuthModules: ["clusters_map", "all"]
};
