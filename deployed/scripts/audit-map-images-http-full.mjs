import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const baseUrl = process.env.MAP_BASE_URL || "http://localhost:5173";

const maps = [
  {
    id: "community-priorities-map",
    route: "/community-priorities-map",
    distDir: path.join(repoRoot, "frontend/dist/community-priorities-map"),
    displayMode: ""
  },
  {
    id: "cluster-priorities-map",
    route: "/cluster-priorities-map",
    distDir: path.join(repoRoot, "frontend/dist/cluster-priorities-map"),
    displayMode: "infrastructure"
  },
  {
    id: "cluster-priorities-assets-map",
    route: "/cluster-priorities-assets-map",
    distDir: path.join(repoRoot, "frontend/dist/cluster-priorities-assets-map"),
    displayMode: "infrastructure"
  }
];

function listPreviewFiles(distDir) {
  const dataDir = path.join(distDir, "cursor_v2_map_data");
  const files = [];
  for (const folder of ["photo_previews", "infrastructure_photo_previews"]) {
    const absoluteDir = path.join(dataDir, folder);
    if (!fs.existsSync(absoluteDir)) continue;
    for (const name of fs.readdirSync(absoluteDir)) {
      if (!name.toLowerCase().endsWith(".jpg")) continue;
      files.push(`cursor_v2_map_data/${folder}/${name}`);
    }
  }
  return files;
}

let failures = 0;

for (const map of maps) {
  const files = listPreviewFiles(map.distDir);
  let ok = 0;
  for (const file of files) {
    const url = `${baseUrl}${map.route}/${file}`;
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (!response.ok) {
        failures += 1;
        if (failures <= 10) console.log(`FAIL ${response.status} ${url}`);
      } else {
        ok += 1;
      }
    } catch (error) {
      failures += 1;
      if (failures <= 10) console.log(`FAIL ${url}: ${error.message}`);
    }
  }
  console.log(`${map.id}: ${ok}/${files.length} preview JPEGs reachable via HTTP`);
}

process.exit(failures > 0 ? 1 : 0);
