import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectPreviewHashesFromRecords, loadWindowAssignments } from "./photo-asset-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(scriptDir, "../cursor_v2_map_data");

const dataFiles = [
  { file: "photo_backed_priorities.js", key: "PHOTO_BACKED_PRIORITIES" },
  { file: "photo_index.js", key: "CURSOR_V2_PHOTO_INDEX" },
  { file: "infrastructure_priorities.js", key: "INFRASTRUCTURE_PRIORITIES" },
  { file: "infrastructure_area_photos.js", key: "INFRASTRUCTURE_AREA_PHOTOS" }
];

const previewDirs = {
  photo_previews: path.join(dataDir, "photo_previews"),
  infrastructure_photo_previews: path.join(dataDir, "infrastructure_photo_previews")
};

function previewHashesOnDisk(dir) {
  const hashes = new Set();
  if (!fs.existsSync(dir)) return hashes;
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith(".jpg")) continue;
    hashes.add(name.replace(/\.jpg$/i, ""));
  }
  return hashes;
}

const diskHashes = {
  photo_previews: previewHashesOnDisk(previewDirs.photo_previews),
  infrastructure_photo_previews: previewHashesOnDisk(previewDirs.infrastructure_photo_previews)
};

let missing = 0;

for (const { file, key } of dataFiles) {
  const absolutePath = path.join(dataDir, file);
  if (!fs.existsSync(absolutePath)) continue;

  const windowData = loadWindowAssignments(dataDir, file);
  const records = windowData[key] || [];
  const hashes = collectPreviewHashesFromRecords(records);

  for (const hash of hashes) {
    const inPhoto = diskHashes.photo_previews.has(hash);
    const inInfra = diskHashes.infrastructure_photo_previews.has(hash);
    if (!inPhoto && !inInfra) {
      missing += 1;
      console.log(`missing preview for hash ${hash} referenced in ${file}`);
    }
  }
}

console.log(`\nSource data orphan references: ${missing}`);
process.exit(missing > 0 ? 1 : 0);
