# Community Priorities Map Data

Generated GIS and photo data for the Community Priorities and Cluster Priorities Leaflet maps.

Photo previews are **not** bundled with the frontend app for production; they are deployed separately to S3.

## Layout

```text
deployed/
├── index.html                          # Legacy monolithic map (reference / extract source)
├── package.json                        # Data generators + local preview server
└── cursor_v2_map_data/
    ├── photo_backed_priorities.js
    ├── infrastructure_priorities.js
    ├── layers_bundle.js
    ├── photo_index.js
    ├── icons/
    ├── photo_previews/                 # Upload to S3 — not bundled in frontend sync
    └── infrastructure_photo_previews/
```

## Regenerate data

```powershell
cd deployed
npm install
npm run generate:data
npm run generate:infrastructure
```

## Local preview (legacy monolith)

```powershell
cd deployed
npm run dev
```

Open http://localhost:5174. For the maintainable split source, use `frontend/community-priorities-src/` and `sync-community-priorities-map.ps1`.

## Production

Packaged maps deploy to isolated CloudFront: [https://d1b6znwb7yuvt4.cloudfront.net](https://d1b6znwb7yuvt4.cloudfront.net)

```powershell
.\deploy-maps-to-aws.ps1
```

See root `README.md` for full deploy and local dev instructions.
