import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadWindowAssignments } from "./photo-asset-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const baseUrl = process.env.MAP_BASE_URL || "http://localhost:5173";

const maps = [
  {
    id: "community-priorities-map",
    route: "/community-priorities-map/map.htm",
    distDir: path.join(repoRoot, "frontend/dist/community-priorities-map"),
    samples: ["photo_backed_priorities.js", "photo_index.js"]
  },
  {
    id: "cluster-priorities-map",
    route: "/cluster-priorities-map/map.htm",
    distDir: path.join(repoRoot, "frontend/dist/cluster-priorities-map"),
    samples: ["infrastructure_priorities.js", "infrastructure_area_photos.js", "photo_index.js"]
  },
  {
    id: "cluster-priorities-assets-map",
    route: "/cluster-priorities-assets-map/map.htm",
    distDir: path.join(repoRoot, "frontend/dist/cluster-priorities-assets-map"),
    samples: ["infrastructure_priorities.js", "infrastructure_area_photos.js", "photo_index.js"]
  }
];

const imagePattern = /cursor_v2_map_data\/(?:(?:infrastructure_)?photo_previews\/[^"'`\s]+|icons\/[^"'`\s]+)/g;

function readConfig(distDir) {
  const source = fs.readFileSync(path.join(distDir, "src/config.js"), "utf8");
  return {
    displayMode: source.match(/displayMode:\s*"([^"]+)"/)?.[1] || "",
    priorityPhotoBaseUrl: source.match(/priorityPhotoBaseUrl:\s*"([^"]*)"/)?.[1] || ""
  };
}

function resolvePath(imagePath, config) {
  let assetPath = imagePath;
  if (config.displayMode === "infrastructure" && /\/photo_previews\//i.test(assetPath)) {
    assetPath = assetPath.replace(/\/photo_previews\//i, "/infrastructure_photo_previews/");
  }
  return assetPath;
}

function sampleImages(distDir, fileName, limit = 12) {
  const dataDir = path.join(distDir, "cursor_v2_map_data");
  const source = fs.readFileSync(path.join(dataDir, fileName), "utf8");
  const matches = [...new Set(source.match(imagePattern) || [])];
  return matches.slice(0, limit);
}

let failures = 0;

for (const map of maps) {
  const config = readConfig(map.distDir);
  const urls = new Set();
  for (const fileName of map.samples) {
    for (const imagePath of sampleImages(map.distDir, fileName)) {
      const relative = resolvePath(imagePath, config);
      urls.add(`${map.route.replace("/map.htm", "")}/${relative}`.replace(/([^:]\/)\/+/g, "$1"));
    }
  }

  let ok = 0;
  for (const urlPath of urls) {
    const finalUrl = `${baseUrl}${urlPath}`;
    try {
      const response = await fetch(finalUrl, { method: "HEAD" });
      if (!response.ok) {
        failures += 1;
        console.log(`FAIL ${response.status} ${finalUrl}`);
      } else {
        ok += 1;
      }
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${finalUrl}: ${error.message}`);
    }
  }

  console.log(`${map.id}: ${ok}/${urls.size} sample images reachable`);
}

process.exit(failures > 0 ? 1 : 0);
