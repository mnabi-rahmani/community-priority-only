import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadWindowAssignments } from "./photo-asset-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

const maps = [
  {
    id: "community-priorities-map",
    distDir: path.join(repoRoot, "frontend/dist/community-priorities-map"),
    configPath: "src/config.js",
    dataFiles: ["photo_backed_priorities.js", "photo_index.js", "layers_bundle.js"]
  },
  {
    id: "cluster-priorities-map",
    distDir: path.join(repoRoot, "frontend/dist/cluster-priorities-map"),
    configPath: "src/config.js",
    dataFiles: [
      "infrastructure_priorities.js",
      "infrastructure_area_photos.js",
      "photo_index.js",
      "layers_bundle.js"
    ]
  },
  {
    id: "cluster-priorities-assets-map",
    distDir: path.join(repoRoot, "frontend/dist/cluster-priorities-assets-map"),
    configPath: "src/config.js",
    dataFiles: [
      "infrastructure_priorities.js",
      "infrastructure_area_photos.js",
      "photo_index.js",
      "layers_bundle.js"
    ]
  }
];

const imagePathPattern = /(?:infrastructure_)?photo_previews\/[^"'`\s]+|cursor_v2_map_data\/icons\/[^"'`\s]+/gi;

function readConfig(distDir, configPath) {
  const absolutePath = path.join(distDir, configPath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const config = {};
  const displayMode = source.match(/displayMode:\s*"([^"]+)"/)?.[1] || "";
  const priorityPhotoBaseUrl = source.match(/priorityPhotoBaseUrl:\s*"([^"]*)"/)?.[1] || "";
  config.displayMode = displayMode;
  config.priorityPhotoBaseUrl = priorityPhotoBaseUrl;
  return config;
}

function resolveLocalAssetUrl(assetPath, config, mapId) {
  let resolved = String(assetPath || "");
  if (/^(https?:|file:|blob:|data:)/i.test(resolved)) return { url: resolved, localPath: null };

  if (config.displayMode === "infrastructure" && /(?:^|\/)photo_previews\//i.test(resolved)) {
    resolved = resolved.replace(/(^|\/)photo_previews\//i, "$1infrastructure_photo_previews/");
  }

  const previewMatch = resolved.match(/(?:infrastructure_)?photo_previews\/([^/?#]+)/i);
  const useLocalPriorityPhotos = mapId === "cluster-priorities-assets-map"
    || mapId === "community-priorities-map"
    || mapId === "cluster-priorities-map";

  if (previewMatch) {
    if (useLocalPriorityPhotos) {
      return { url: resolved, localPath: resolved };
    }
    if (config.priorityPhotoBaseUrl) {
      return { url: config.priorityPhotoBaseUrl + previewMatch[1], localPath: resolved };
    }
    return { url: resolved, localPath: resolved };
  }

  return { url: resolved, localPath: resolved };
}

function collectImagePathsFromValue(value, results) {
  if (value == null) return;
  if (typeof value === "string") {
    const matches = value.match(imagePathPattern);
    if (matches) matches.forEach((match) => results.add(match));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImagePathsFromValue(item, results));
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectImagePathsFromValue(item, results));
  }
}

function collectFromLayersBundle(dataDir) {
  const results = new Set();
  const bundlePath = path.join(dataDir, "layers_bundle.js");
  if (!fs.existsSync(bundlePath)) return results;

  const windowData = loadWindowAssignments(dataDir, "layers_bundle.js");
  const styles = windowData.CURSOR_V2_STYLES || {};
  for (const style of Object.values(styles)) {
    if (style?.icon) results.add(style.icon);
  }
  return results;
}

function collectFromDataFile(dataDir, fileName) {
  const results = new Set();
  const absolutePath = path.join(dataDir, fileName);
  if (!fs.existsSync(absolutePath)) return results;

  const windowData = loadWindowAssignments(dataDir, fileName);
  for (const value of Object.values(windowData)) {
    collectImagePathsFromValue(value, results);
  }

  const source = fs.readFileSync(absolutePath, "utf8");
  const matches = source.match(imagePathPattern);
  if (matches) matches.forEach((match) => results.add(match));

  return results;
}

function existsInDist(distDir, localPath) {
  if (!localPath) return true;
  const normalized = localPath.replace(/^cursor_v2_map_data\//, "");
  return fs.existsSync(path.join(distDir, "cursor_v2_map_data", normalized));
}

const report = [];

for (const map of maps) {
  const config = readConfig(map.distDir, map.configPath);
  const dataDir = path.join(map.distDir, "cursor_v2_map_data");
  const imagePaths = new Set();

  for (const fileName of map.dataFiles) {
    for (const imagePath of collectFromDataFile(dataDir, fileName)) {
      imagePaths.add(imagePath);
    }
  }
  for (const imagePath of collectFromLayersBundle(dataDir)) {
    imagePaths.add(imagePath);
  }

  const missing = [];
  const resolved = [];

  for (const imagePath of [...imagePaths].sort()) {
    const { url, localPath } = resolveLocalAssetUrl(imagePath, config, map.id);
    const ok = existsInDist(map.distDir, localPath);
    resolved.push({ imagePath, url, localPath, ok });
    if (!ok) missing.push({ imagePath, localPath, url });
  }

  report.push({
    mapId: map.id,
    config,
    totalImages: imagePaths.size,
    missingCount: missing.length,
    missing
  });
}

let exitCode = 0;
for (const entry of report) {
  console.log(`\n=== ${entry.mapId} ===`);
  console.log(`displayMode: ${entry.config.displayMode || "(default)"}`);
  console.log(`priorityPhotoBaseUrl: ${entry.config.priorityPhotoBaseUrl || "(empty)"}`);
  console.log(`referenced images: ${entry.totalImages}`);
  console.log(`missing in dist: ${entry.missingCount}`);
  if (entry.missingCount > 0) {
    exitCode = 1;
    for (const item of entry.missing.slice(0, 20)) {
      console.log(`  - ${item.imagePath}`);
      console.log(`    expected: cursor_v2_map_data/${item.localPath?.replace(/^cursor_v2_map_data\//, "")}`);
    }
    if (entry.missingCount > 20) {
      console.log(`  ... and ${entry.missingCount - 20} more`);
    }
  }
}

process.exit(exitCode);
