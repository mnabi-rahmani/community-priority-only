import fs from "node:fs";
import path from "node:path";

import XLSX from "xlsx";

import { infrastructureAssetsRoot } from "./infrastructure-assets-path.mjs";

const GPS_FIXES = [
  {
    fileName: "Baghlan Infrastructure Priorities.xlsx",
    sheetName: "cluster 2",
    rowNumber: 5,
    lat: 36.19021111,
    lon: 68.77346111,
    evidence: "Culvert, Mulla Toor.HEIC (territorial road in Mulla Toor sub-village)"
  },
  {
    fileName: "Baghlan Infrastructure Priorities.xlsx",
    sheetName: "cluster 2",
    rowNumber: 6,
    lat: 36.1864916,
    lon: 68.760431,
    evidence: "Central accessible point for five sub-villages (existing community hall GPS)"
  },
  {
    fileName: "Baghlan Infrastructure Priorities.xlsx",
    sheetName: "cluster 4",
    rowNumber: 8,
    lat: 36.2117116,
    lon: 68.77661111,
    evidence: "Start point of CL4 and Malem Akbar Village.HEIC (corrected longitude)"
  },
  {
    fileName: "Baghlan Infrastructure Priorities.xlsx",
    sheetName: "cluster 10",
    rowNumber: 3,
    lat: 36.1009916,
    lon: 68.85977,
    evidence: "BHC - Shaikh Jalal.HEIC (center of Shaikh Jalal community)"
  },
  {
    fileName: "Baghlan Infrastructure Priorities.xlsx",
    sheetName: "cluster 10",
    rowNumber: 5,
    lat: 36.09581111,
    lon: 68.86607222,
    evidence: "Water Storage, Shaikh jalal.HEIC"
  },
  {
    fileName: "Nawabad Infrastructure Priorities.xlsx",
    sheetName: "Sheet1",
    rowNumber: 1,
    lat: 36.70258333,
    lon: 68.73657222,
    evidence: "CHC - Nawabad Markazi.HEIC (Nawabad main road area)"
  },
  {
    fileName: "Nawabad Infrastructure Priorities.xlsx",
    sheetName: "Sheet1",
    rowNumber: 7,
    lat: 36.70188611,
    lon: 68.72951389,
    evidence: "Nawabad High School, Nawabad Kunjak.HEIC"
  },
  {
    fileName: "Nawabad Infrastructure Priorities.xlsx",
    sheetName: "Sheet1",
    rowNumber: 8,
    lat: 36.70188611,
    lon: 68.72951389,
    evidence: "Nawabad High School, Nawabad Kunjak.HEIC (school boundary wall)"
  }
];

function patchSheet(workbook, sheetName, rowNumber, lat, lon) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

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

  if (!updated) {
    throw new Error(`Row ${rowNumber} not found in ${sheetName}`);
  }

  workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows);
}

function main() {
  const touchedFiles = new Set();

  for (const fix of GPS_FIXES) {
    const workbookPath = path.join(infrastructureAssetsRoot, fix.fileName);
    let workbook;

    if (touchedFiles.has(workbookPath)) {
      workbook = XLSX.readFile(workbookPath);
    } else {
      workbook = XLSX.readFile(workbookPath);
      touchedFiles.add(workbookPath);
    }

    patchSheet(workbook, fix.sheetName, fix.rowNumber, fix.lat, fix.lon);
    XLSX.writeFile(workbook, workbookPath);
    console.log(
      `Updated ${fix.fileName} [${fix.sheetName}] #${fix.rowNumber} -> ${fix.lat}, ${fix.lon}`
    );
    console.log(`  Evidence: ${fix.evidence}`);
  }

  const logPath = path.join(infrastructureAssetsRoot, "GPS fixes applied.json");
  fs.writeFileSync(logPath, `${JSON.stringify(GPS_FIXES, null, 2)}\n`, "utf8");
  console.log(`\nWrote fix log: ${logPath}`);
}

main();
