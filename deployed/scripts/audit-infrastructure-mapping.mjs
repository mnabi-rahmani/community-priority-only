import fs from "node:fs";
import path from "node:path";

import XLSX from "xlsx";

import { deployedDir, infrastructureAssetsRoot } from "./infrastructure-assets-path.mjs";

const reviewPath = path.join(deployedDir, "cursor_v2_map_data", "infrastructure_priorities_review.json");

const excelFiles = [
  { fileName: "Baghlan Infrastructure Priorities v3.xlsx", region: "Baghlan-e-Jadid" },
  { fileName: "Nawabad Infrastructure Priorities v2.xlsx", region: "Nawabad", defaultCluster: "Nawabad Cluster" }
];

function compactWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseCoordinate(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = compactWhitespace(value);
  if (!text || !/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeClusterFromSheet(sheetName, fallback) {
  const match = String(sheetName || "").match(/cluster\s*#?\s*(\d+)/i);
  if (match) return `Cluster ${Number(match[1])}`;
  if (/nawabad/i.test(String(sheetName || ""))) return "Nawabad Cluster";
  return fallback || "";
}

function normalizePriorityLevel(value) {
  const text = compactWhitespace(value);
  if (!text) return "Medium";
  if (/high/i.test(text)) return "High";
  if (/medium|meduim/i.test(text)) return "Medium";
  if (/low/i.test(text)) return "Low";
  return text;
}

function rowKey(row) {
  return [
    row.cluster,
    row.rowNumber ?? "",
    row.intervention,
    row.location,
    row.lat != null ? row.lat.toFixed(6) : "no-lat",
    row.lon != null ? row.lon.toFixed(6) : "no-lon"
  ].join("|");
}

function mapKey(point) {
  return [
    point.cluster,
    point.priorityNumber ?? "",
    point.intervention,
    point.location,
    Number(point.lat).toFixed(6),
    Number(point.lon).toFixed(6)
  ].join("|");
}

function readSpreadsheetRows() {
  const rows = [];

  for (const excel of excelFiles) {
    const workbookPath = path.join(infrastructureAssetsRoot, excel.fileName);
    const workbook = XLSX.readFile(workbookPath);

    for (const sheetName of workbook.SheetNames) {
      const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
      const cluster = normalizeClusterFromSheet(sheetName, excel.defaultCluster || "");

      for (const row of sheetRows) {
        const intervention = compactWhitespace(row["Infrastructure Priority interventions"]);
        const location = compactWhitespace(row["Specific location in the community"]);
        if (!intervention) continue;

        rows.push({
          region: excel.region,
          cluster,
          sheetName,
          rowNumber: row.NO,
          intervention,
          location,
          level: normalizePriorityLevel(row["Priority level"]),
          lat: parseCoordinate(row.Latitude),
          lon: parseCoordinate(row.Longitude),
          hasCoordinates: parseCoordinate(row.Latitude) != null && parseCoordinate(row.Longitude) != null
        });
      }
    }
  }

  return rows;
}

const spreadsheetRows = readSpreadsheetRows();
const mappedPoints = JSON.parse(fs.readFileSync(reviewPath, "utf8"));

const mappedKeys = new Set(mappedPoints.map(mapKey));
const spreadsheetMappable = spreadsheetRows.filter((row) => row.hasCoordinates);
const spreadsheetUnmappable = spreadsheetRows.filter((row) => !row.hasCoordinates);

const mappedFromSpreadsheet = spreadsheetMappable.filter((row) => mappedKeys.has(rowKey(row)));
const missingFromMap = spreadsheetMappable.filter((row) => !mappedKeys.has(rowKey(row)));
const extraInMap = mappedPoints.filter((point) => {
  const key = mapKey(point);
  return !spreadsheetMappable.some((row) => rowKey(row) === key);
});

const byCluster = {};
for (const row of spreadsheetRows) {
  if (!byCluster[row.cluster]) {
    byCluster[row.cluster] = { total: 0, withCoords: 0, mapped: 0, missingCoords: 0, unmapped: 0, withPhotos: 0 };
  }
  const bucket = byCluster[row.cluster];
  bucket.total += 1;
  if (row.hasCoordinates) {
    bucket.withCoords += 1;
    if (mappedKeys.has(rowKey(row))) {
      bucket.mapped += 1;
      const mapped = mappedPoints.find((point) => mapKey(point) === rowKey(row));
      if (mapped?.photoCount > 0) bucket.withPhotos += 1;
    } else {
      bucket.unmapped += 1;
    }
  } else {
    bucket.missingCoords += 1;
  }
}

const report = {
  summary: {
    spreadsheetTotal: spreadsheetRows.length,
    spreadsheetWithCoordinates: spreadsheetMappable.length,
    spreadsheetMissingCoordinates: spreadsheetUnmappable.length,
    currentlyMappedInMap: mappedPoints.length,
    exactlyMapped: mappedFromSpreadsheet.length,
    unmappedWithCoordinates: missingFromMap.length,
    extraMapEntries: extraInMap.length,
    mappedWithPhotos: mappedPoints.filter((point) => point.photoCount > 0).length,
    mappedWithoutPhotos: mappedPoints.filter((point) => !point.photoCount).length
  },
  byCluster,
  missingFromMap,
  spreadsheetMissingCoordinates: spreadsheetUnmappable,
  extraInMap
};

const outputPath = path.join(deployedDir, "cursor_v2_map_data", "infrastructure_mapping_audit.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary, null, 2));
console.log("\nBy cluster:");
for (const [cluster, stats] of Object.entries(byCluster).sort((a, b) => {
  if (a[0] === "Nawabad Cluster") return 1;
  if (b[0] === "Nawabad Cluster") return -1;
  return (Number(a[0].match(/\d+/)?.[0]) || 0) - (Number(b[0].match(/\d+/)?.[0]) || 0);
})) {
  console.log(`${cluster}: ${stats.mapped}/${stats.withCoords} mapped (${stats.withPhotos} with photos), ${stats.total} total rows, ${stats.missingCoords} missing GPS`);
}
if (missingFromMap.length) {
  console.log(`\nUnmapped (${missingFromMap.length}):`);
  for (const row of missingFromMap) {
    console.log(`  [${row.cluster}] #${row.rowNumber} ${row.intervention} @ ${row.location}`);
  }
}
