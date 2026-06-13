import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const deployedDir = path.resolve(scriptDir, "..");
const reviewPath = path.join(deployedDir, "cursor_v2_map_data", "infrastructure_priorities_review.json");
const areaPhotosPath = path.join(deployedDir, "cursor_v2_map_data", "infrastructure_area_photos.js");

function haversineMeters(lat1, lon1, lat2, lon2) {
  const radius = 6371000;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dPhi = (lat2 - lat1) * Math.PI / 180;
  const dLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const priorities = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
const areaPhotosJs = fs.readFileSync(areaPhotosPath, "utf8");
const areaPhotos = JSON.parse(areaPhotosJs.match(/window\.INFRASTRUCTURE_AREA_PHOTOS = (\[[\s\S]*\]);/)[1]);

const withoutPhotos = priorities.filter((point) => !point.photoCount);
const nearest = withoutPhotos.map((point) => {
  const distances = areaPhotos
    .map((photo) => ({
      file: photo.file,
      distanceMeters: haversineMeters(point.lat, point.lon, photo.lat, photo.lon)
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters);

  return {
    id: point.id,
    cluster: point.cluster,
    priorityNumber: point.priorityNumber,
    intervention: point.intervention,
    location: point.location,
    lat: point.lat,
    lon: point.lon,
    nearestWithin100m: distances.filter((item) => item.distanceMeters <= 100).length,
    nearestPhoto: distances[0] || null,
    nearestWithin500m: distances.filter((item) => item.distanceMeters <= 500).slice(0, 3)
  };
});

const outputPath = path.join(deployedDir, "cursor_v2_map_data", "infrastructure_no_photo_analysis.json");
fs.writeFileSync(outputPath, `${JSON.stringify(nearest, null, 2)}\n`, "utf8");

console.log(`${withoutPhotos.length} priorities without photos within 100m`);
for (const item of nearest) {
  const nearestText = item.nearestPhoto
    ? `${item.nearestPhoto.distanceMeters.toFixed(1)}m (${item.nearestPhoto.file})`
    : "no GPS photos indexed";
  console.log(`[${item.cluster}] #${item.priorityNumber} ${item.intervention} — nearest: ${nearestText}`);
}
