import fs from "node:fs";
import path from "node:path";

import XLSX from "xlsx";

import { infrastructureAssetsRoot } from "./infrastructure-assets-path.mjs";

const GPS_FIXES = [
  {
    fileName: "Baghlan Infrastructure Priorities v3.xlsx",
    sheetName: "cluster 4",
    rowNumber: 8,
    lat: 36.2117116,
    lon: 68.77661111,
    reason: "Longitude was copied into the Longitude column; corrected using Malem Akbar road photo GPS."
  },
  {
    fileName: "Baghlan Infrastructure Priorities v3.xlsx",
    sheetName: "cluster 10",
    rowNumber: 3,
    lat: 36.1009916,
    lon: 68.85977,
    reason: "Community hall had identical lat/lon; corrected to Shaikh Jalal BHC center."
  },
  {
    fileName: "Baghlan Infrastructure Priorities v3.xlsx",
    sheetName: "cluster 10",
    rowNumber: 5,
    lat: 36.1039,
    lon: 68.8585,
    reason: "Coordinates were embedded in the Latitude cell with a note; split into proper lat/lon columns."
  },
  {
    fileName: "Nawabad Infrastructure Priorities v2.xlsx",
    sheetName: "Sheet1",
    rowNumber: 6,
    lat: 36.70188611,
    lon: 68.72951389,
    reason: "School rehab had identical lat/lon; corrected to Nawabad High School photo GPS."
  },
  {
    fileName: "Nawabad Infrastructure Priorities v2.xlsx",
    sheetName: "Sheet1",
    rowNumber: 7,
    lat: 36.70188611,
    lon: 68.72951389,
    reason: "School boundary wall had identical lat/lon; corrected to Nawabad High School photo GPS."
  }
];

function patchSheet(workbook, sheetName, rowNumber, lat, lon) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const header = rows[0].map((value) => String(value).trim());
  const noIndex = header.indexOf("NO");
  const latIndex = header.indexOf("Latitude");
  const lonIndex = header.indexOf("Longitude");

  if (noIndex < 0 || latIndex < 0 || lonIndex < 0) {
    throw new Error(`Missing expected columns in ${sheetName}`);
  }

  let updated = false;
  for (let index = 1; index < rows.length; index += 1) {
    if (Number(rows[index][noIndex]) !== rowNumber) continue;
    rows[index][latIndex] = lat;
    rows[index][lonIndex] = lon;
    updated = true;
    break;
  }

  if (!updated) throw new Error(`Row ${rowNumber} not found in ${sheetName}`);
  workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows);
}

function main() {
  const touched = new Map();

  for (const fix of GPS_FIXES) {
    const workbookPath = path.join(infrastructureAssetsRoot, fix.fileName);
    const workbook = touched.get(workbookPath) ?? XLSX.readFile(workbookPath);
    patchSheet(workbook, fix.sheetName, fix.rowNumber, fix.lat, fix.lon);
    touched.set(workbookPath, workbook);
    console.log(`Fixed ${fix.fileName} [${fix.sheetName}] #${fix.rowNumber}`);
    console.log(`  -> ${fix.lat}, ${fix.lon}`);
    console.log(`  ${fix.reason}`);
  }

  for (const [workbookPath, workbook] of touched) {
    XLSX.writeFile(workbook, workbookPath);
  }

  const logPath = path.join(infrastructureAssetsRoot, "v3-v2 GPS fixes applied.json");
  fs.writeFileSync(logPath, `${JSON.stringify(GPS_FIXES, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${logPath}`);
}

main();
