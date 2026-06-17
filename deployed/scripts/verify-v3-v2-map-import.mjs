import fs from "node:fs";
import path from "node:path";

import XLSX from "xlsx";

import { deployedDir, infrastructureAssetsRoot } from "./infrastructure-assets-path.mjs";

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
  if (!text) return null;
  const embeddedPair = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (embeddedPair) return Number(embeddedPair[1]);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLongitude(value, latitudeValue) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = compactWhitespace(value);
  if (!text) {
    const latText = compactWhitespace(latitudeValue);
    const embeddedPair = latText.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (embeddedPair) return Number(embeddedPair[2]);
    return null;
  }
  const embeddedPair = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (embeddedPair) return Number(embeddedPair[2]);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeClusterFromSheet(sheetName, fallback) {
  const match = String(sheetName || "").match(/cluster\s*#?\s*(\d+)/i);
  if (match) return `Cluster ${Number(match[1])}`;
  if (/nawabad/i.test(String(sheetName || ""))) return "Nawabad Cluster";
  return fallback || "";
}

function coordIssue(lat, lon) {
  if (lat == null || lon == null) return "Missing GPS coordinates";
  if (lat === lon) return "Wrong GPS coordinates (latitude equals longitude)";
  if (lon < 67.5 || lon > 70.5 || lat < 35 || lat > 37.5) {
    return "Wrong GPS coordinates (outside expected area)";
  }
  return null;
}

function readSpreadsheetRows() {
  const rows = [];
  for (const excel of excelFiles) {
    const workbook = XLSX.readFile(path.join(infrastructureAssetsRoot, excel.fileName));
    for (const sheetName of workbook.SheetNames) {
      const cluster = normalizeClusterFromSheet(sheetName, excel.defaultCluster || "");
      for (const row of XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" })) {
        const intervention = compactWhitespace(row["Infrastructure Priority interventions"]);
        if (!intervention) continue;
        const lat = parseCoordinate(row.Latitude);
        const lon = parseLongitude(row.Longitude, row.Latitude);
        rows.push({
          fileName: excel.fileName,
          cluster,
          sheetName,
          rowNumber: row.NO,
          intervention,
          location: compactWhitespace(row["Specific location in the community"]),
          lat,
          lon,
          issue: coordIssue(lat, lon)
        });
      }
    }
  }
  return rows;
}

function main() {
  const spreadsheetRows = readSpreadsheetRows();
  const mappedPoints = JSON.parse(
    fs.readFileSync(path.join(deployedDir, "cursor_v2_map_data", "infrastructure_priorities_review.json"), "utf8")
  );

  const issues = spreadsheetRows.filter((row) => row.issue);
  const onMap = mappedPoints.length;
  const withPhotos = mappedPoints.filter((point) => point.photoCount > 0).length;

  const report = {
    generatedAt: new Date().toISOString(),
    spreadsheetTotal: spreadsheetRows.length,
    mappedOnMap: onMap,
    mappedWithPhotos: withPhotos,
    spreadsheetGpsIssues: issues.length,
    issues,
    clusterSummary: {}
  };

  for (const row of spreadsheetRows) {
    if (!report.clusterSummary[row.cluster]) {
      report.clusterSummary[row.cluster] = { total: 0, mapped: 0, gpsIssues: 0 };
    }
    report.clusterSummary[row.cluster].total += 1;
    if (row.issue) report.clusterSummary[row.cluster].gpsIssues += 1;
  }

  for (const point of mappedPoints) {
    if (!report.clusterSummary[point.cluster]) {
      report.clusterSummary[point.cluster] = { total: 0, mapped: 0, gpsIssues: 0 };
    }
    report.clusterSummary[point.cluster].mapped += 1;
  }

  const outputPath = path.join(deployedDir, "cursor_v2_map_data", "infrastructure_v3_v2_import_report.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    spreadsheetTotal: report.spreadsheetTotal,
    mappedOnMap: report.mappedOnMap,
    mappedWithPhotos: report.mappedWithPhotos,
    spreadsheetGpsIssues: report.spreadsheetGpsIssues
  }, null, 2));

  if (issues.length) {
    console.log("\nRemaining spreadsheet GPS issues:");
    for (const row of issues) {
      console.log(`  [${row.cluster}] #${row.rowNumber} ${row.intervention.slice(0, 55)}`);
      console.log(`    ${row.issue}`);
    }
  }
}

main();
