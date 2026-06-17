import fs from "node:fs";
import path from "node:path";

import XLSX from "xlsx";

import { deployedDir, infrastructureAssetsRoot } from "./infrastructure-assets-path.mjs";

const reviewPath = path.join(deployedDir, "cursor_v2_map_data", "infrastructure_priorities_review.json");
const outputPath = path.join(
  infrastructureAssetsRoot,
  "Infrastructure Priorities - Map Comparison Report.xlsx"
);
const fallbackOutputPath = path.join(
  deployedDir,
  "cursor_v2_map_data",
  "Infrastructure Priorities - Map Comparison Report.xlsx"
);

const excelFiles = [
  { fileName: "Baghlan Infrastructure Priorities v3.xlsx", region: "Baghlan-e-Jadid" },
  { fileName: "Nawabad Infrastructure Priorities v2.xlsx", region: "Nawabad", defaultCluster: "Nawabad Cluster" }
];

const LAT_MIN = 35;
const LAT_MAX = 37.5;
const LON_MIN = 67.5;
const LON_MAX = 70.5;

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

function coordIssue(lat, lon) {
  if (lat == null || lon == null) {
    return { type: "Missing GPS coordinates", detail: "Latitude and/or longitude are blank in the source spreadsheet." };
  }
  if (lat === lon) {
    return {
      type: "Wrong GPS coordinates",
      detail: `Latitude and longitude are identical (${lat}), which usually means longitude was copied from latitude or entered in the wrong column.`
    };
  }
  if (lon < LON_MIN || lon > LON_MAX || lat < LAT_MIN || lat > LAT_MAX) {
    return {
      type: "Wrong GPS coordinates",
      detail: `Coordinates (${lat}, ${lon}) fall outside the expected Kunduz/Baghlan area (lat ${LAT_MIN}-${LAT_MAX}, lon ${LON_MIN}-${LON_MAX}).`
    };
  }
  return null;
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

        const lat = parseCoordinate(row.Latitude);
        const lon = parseCoordinate(row.Longitude);

        rows.push({
          sourceFile: excel.fileName,
          region: excel.region,
          cluster,
          sheetName,
          rowNumber: row.NO,
          intervention,
          location,
          level: normalizePriorityLevel(row["Priority level"]),
          excelLat: lat,
          excelLon: lon,
          hasCoordinates: lat != null && lon != null
        });
      }
    }
  }

  return rows;
}

function findMapPoint(mappedPoints, spreadsheetRow) {
  const key = rowKey({
    cluster: spreadsheetRow.cluster,
    rowNumber: spreadsheetRow.rowNumber,
    intervention: spreadsheetRow.intervention,
    location: spreadsheetRow.location,
    lat: spreadsheetRow.excelLat,
    lon: spreadsheetRow.excelLon
  });

  return mappedPoints.find((point) => mapKey(point) === key)
    ?? mappedPoints.find((point) =>
      point.cluster === spreadsheetRow.cluster
      && point.priorityNumber === spreadsheetRow.rowNumber
      && compactWhitespace(point.intervention) === spreadsheetRow.intervention
    );
}

function analyzeRow(spreadsheetRow, mappedPoints) {
  const excelIssue = coordIssue(spreadsheetRow.excelLat, spreadsheetRow.excelLon);
  const mapPoint = findMapPoint(mappedPoints, spreadsheetRow);
  const mapIssue = mapPoint ? coordIssue(mapPoint.lat, mapPoint.lon) : null;

  let mapStatus = "Not on map";
  let issueType = "";
  let issueDetail = "";
  let shukranRelevance = "";

  if (!spreadsheetRow.hasCoordinates) {
    mapStatus = "Cannot be mapped";
    issueType = "Missing GPS coordinates";
    issueDetail = "No coordinates were provided in the source spreadsheet, so this priority cannot appear on the map.";
  } else if (excelIssue) {
    mapStatus = mapPoint ? "On map (source GPS also invalid)" : "Not on map";
    issueType = excelIssue.type;
    issueDetail = excelIssue.detail;
  } else if (!mapPoint) {
    mapStatus = "Not on map";
    issueType = "Not imported to map";
    issueDetail = "Coordinates exist in the spreadsheet but this row was not found in the generated map data.";
  } else if (mapIssue) {
    mapStatus = "On map but not visible";
    issueType = mapIssue.type;
    issueDetail = `${mapIssue.detail} The map inherited these coordinates from the spreadsheet.`;
  } else {
    mapStatus = "On map";
    issueType = "OK";
    issueDetail = "Spreadsheet coordinates match the map and appear valid.";
  }

  if (issueType !== "OK") {
    if (/leveling|graveling|releveling|gravelling/i.test(spreadsheetRow.intervention)) {
      shukranRelevance = "Matches Shukran feedback about missing road leveling/graveling points.";
    } else if (/community hall/i.test(spreadsheetRow.intervention)) {
      shukranRelevance = "Matches Shukran feedback about a missing community hall.";
    } else if (/reservoir|cleaning.*water storage/i.test(spreadsheetRow.intervention)) {
      shukranRelevance = "Matches Shukran feedback about missing reservoir cleaning.";
    } else if (/water supply/i.test(spreadsheetRow.intervention)) {
      shukranRelevance = "Related to Shukran water-supply count comments (see summary sheet).";
    } else if (/protection wall/i.test(spreadsheetRow.intervention)) {
      shukranRelevance = "Related to Shukran protection-wall count comments (see summary sheet).";
    } else if (spreadsheetRow.cluster === "Nawabad Cluster") {
      shukranRelevance = "Matches Shukran feedback about missing Nawabad priorities.";
    }
  }

  return {
    ...spreadsheetRow,
    mapStatus,
    onMap: mapPoint ? "Yes" : "No",
    mapLat: mapPoint?.lat ?? "",
    mapLon: mapPoint?.lon ?? "",
    mapId: mapPoint?.id ?? "",
    photoCount: mapPoint?.photoCount ?? "",
    issueType,
    issueDetail,
    shukranRelevance,
    dataProviderAction: issueType === "OK"
      ? "None"
      : "Data provider should supply corrected GPS coordinates in the source spreadsheet."
  };
}

function buildComparisonRows(spreadsheetRows, mappedPoints) {
  return spreadsheetRows.map((row) => {
    const result = analyzeRow(row, mappedPoints);
    return {
      Region: result.region,
      Cluster: result.cluster,
      "Priority NO": result.rowNumber,
      "Priority level": result.level,
      Intervention: result.intervention,
      Location: result.location,
      "Excel Latitude": result.excelLat ?? "",
      "Excel Longitude": result.excelLon ?? "",
      "On map?": result.onMap,
      "Map status": result.mapStatus,
      "Map Latitude": result.mapLat,
      "Map Longitude": result.mapLon,
      "Map record ID": result.mapId,
      "Photo count": result.photoCount,
      "Issue type": result.issueType,
      "Issue detail": result.issueDetail,
      "Shukran feedback link": result.shukranRelevance,
      "Data provider action": result.dataProviderAction,
      "Source file": result.sourceFile,
      "Source sheet": result.sheetName
    };
  });
}

function buildIssueSummary(comparisonRows) {
  const byType = {};
  for (const row of comparisonRows) {
    const type = row["Issue type"];
    if (type === "OK") continue;
    if (!byType[type]) byType[type] = [];
    byType[type].push(row);
  }

  const lines = [
    ["Issue type", "Count", "Clusters affected", "Explanation"],
    [
      "Missing GPS coordinates",
      (byType["Missing GPS coordinates"] || []).length,
      [...new Set((byType["Missing GPS coordinates"] || []).map((r) => r.Cluster))].join(", "),
      "Rows were never given latitude/longitude in the source spreadsheet, so the map generator skipped them."
    ],
    [
      "Wrong GPS coordinates",
      (byType["Wrong GPS coordinates"] || []).length,
      [...new Set((byType["Wrong GPS coordinates"] || []).map((r) => r.Cluster))].join(", "),
      "Coordinates are invalid (e.g. latitude copied into longitude), so the point does not plot in the correct location."
    ],
    [
      "Not imported to map",
      (byType["Not imported to map"] || []).length,
      [...new Set((byType["Not imported to map"] || []).map((r) => r.Cluster))].join(", "),
      "Spreadsheet had coordinates but the row was not found in generated map data."
    ]
  ];

  return lines;
}

function buildShukranSummary(spreadsheetRows, comparisonRows) {
  const countByCluster = (cluster, pattern) =>
    spreadsheetRows.filter((r) => r.cluster === cluster && pattern.test(r.intervention)).length;

  const visibleByCluster = (cluster, pattern) =>
    comparisonRows.filter((r) => r.Cluster === cluster && pattern.test(r.Intervention) && r["Issue type"] === "OK").length;

  const claims = [
    {
      cluster: "Cluster 2",
      shukranClaim: "Two road leveling/graveling points were not included.",
      excelCount: countByCluster("Cluster 2", /leveling|graveling|releveling|gravelling/i),
      mapVisibleCount: visibleByCluster("Cluster 2", /leveling|graveling|releveling|gravelling/i),
      accurate: "Yes",
      reason: "Priorities #5 and #6 exist in the spreadsheet but have no GPS coordinates, so they cannot appear on the map. This is a data-provider GPS gap, not a map omission of valid coordinates."
    },
    {
      cluster: "Cluster 4",
      shukranClaim: "Leveling and graveling of roads were not included.",
      excelCount: countByCluster("Cluster 4", /leveling|graveling|releveling|gravelling/i),
      mapVisibleCount: visibleByCluster("Cluster 4", /leveling|graveling|releveling|gravelling/i),
      accurate: "Yes (not visible on map)",
      reason: "Priority #8 is in the spreadsheet and was imported, but coordinates are wrong (36.2117116, 36.2117116). The point exists in map data but does not display in the correct place."
    },
    {
      cluster: "Cluster 10",
      shukranClaim: "Community hall was not added.",
      excelCount: countByCluster("Cluster 10", /community hall/i),
      mapVisibleCount: visibleByCluster("Cluster 10", /community hall/i),
      accurate: "Yes (not visible on map)",
      reason: "Priority #3 is in the spreadsheet and was imported, but coordinates are wrong (36.099194, 36.099194). Same latitude/longitude copy error."
    },
    {
      cluster: "Cluster 10",
      shukranClaim: "Cleaning water storage reservoirs were not included.",
      excelCount: countByCluster("Cluster 10", /reservoir|cleaning.*water storage/i),
      mapVisibleCount: visibleByCluster("Cluster 10", /reservoir|cleaning.*water storage/i),
      accurate: "Yes",
      reason: "Priority #5 is in the spreadsheet but has no GPS coordinates."
    },
    {
      cluster: "Nawabad Cluster",
      shukranClaim: "Several Nawabad points were missing.",
      excelCount: spreadsheetRows.filter((r) => r.cluster === "Nawabad Cluster").length,
      mapVisibleCount: comparisonRows.filter((r) => r.Cluster === "Nawabad Cluster" && r["Issue type"] === "OK").length,
      accurate: "Yes",
      reason: "Spreadsheet has 7 priorities; only 4 plot correctly. Missing GPS on #1, #7, #8. Map correctly reflects only rows with valid coordinates."
    },
    {
      cluster: "Cluster 7",
      shukranClaim: "Three water supply system locations, not only one.",
      excelCount: countByCluster("Cluster 7", /water supply/i),
      mapVisibleCount: visibleByCluster("Cluster 7", /water supply/i),
      accurate: "Partially / No",
      reason: "The spreadsheet has only ONE row labeled 'water supply' (#1). Two additional water-related rows (#2 repair of water storage, #3 construction of water storage system) are separate intervention types and ARE on the map. Shukran may be counting field locations or CAP wording, not separate spreadsheet rows."
    },
    {
      cluster: "Cluster 8",
      shukranClaim: "Two water supply system points, not only one.",
      excelCount: countByCluster("Cluster 8", /water supply/i),
      mapVisibleCount: visibleByCluster("Cluster 8", /water supply/i),
      accurate: "No",
      reason: "The spreadsheet contains only ONE water supply row (#1, Mata Khil). There is no second water-supply row for the map to show. If two locations are needed, the data provider must add a second row with GPS."
    },
    {
      cluster: "Cluster 3",
      shukranClaim: "Three protection wall locations, three water supply locations, two road leveling/graveling points.",
      excelCount: `${countByCluster("Cluster 3", /protection wall/i)} wall / ${countByCluster("Cluster 3", /water supply/i)} water / ${countByCluster("Cluster 3", /leveling|graveling|releveling|gravelling/i)} road`,
      mapVisibleCount: `${visibleByCluster("Cluster 3", /protection wall/i)} wall / ${visibleByCluster("Cluster 3", /water supply/i)} water / ${visibleByCluster("Cluster 3", /leveling|graveling|releveling|gravelling/i)} road`,
      accurate: "No",
      reason: "The spreadsheet has 1 protection wall, 1 water supply, and 1 road row. All are on the map. Shukran's 3/3/2 expectation is not reflected in the source Excel structure (e.g. one row mentions '3 critical areas' but is an agricultural canal, not three protection-wall points)."
    },
    {
      cluster: "Cluster 1",
      shukranClaim: "Small span bridge should be inside cluster boundary.",
      excelCount: countByCluster("Cluster 1", /bridge/i),
      mapVisibleCount: visibleByCluster("Cluster 1", /bridge/i),
      accurate: "Boundary review (excluded from GPS analysis)",
      reason: "Bridge priority #7 is on the map with valid coordinates. Any inside/outside boundary concern is a boundary-editing task, not a missing or wrong GPS row in the spreadsheet."
    },
    {
      cluster: "Cluster 5",
      shukranClaim: "Sub health center should be inside cluster boundary.",
      excelCount: countByCluster("Cluster 5", /sub.?health/i),
      mapVisibleCount: visibleByCluster("Cluster 5", /sub.?health/i),
      accurate: "Boundary review (excluded from GPS analysis)",
      reason: "Sub-health center priority #5 is on the map with valid coordinates from the spreadsheet."
    },
    {
      cluster: "Cluster 7",
      shukranClaim: "Cluster boundary should include water supply systems.",
      excelCount: "N/A",
      mapVisibleCount: "N/A",
      accurate: "Boundary review (excluded from GPS analysis)",
      reason: "Water-related priorities #1-#3 have valid spreadsheet GPS and are on the map. Any inclusion issue is a boundary polygon edit, not missing source data."
    }
  ];

  return [
    ["Cluster", "Shukran claim", "Rows in source Excel", "Correctly visible on map", "Claim accurate?", "Why it happened / root cause"],
    ...claims.map((c) => [
      c.cluster,
      c.shukranClaim,
      String(c.excelCount),
      String(c.mapVisibleCount),
      c.accurate,
      c.reason
    ]),
    [],
    ["Overall data quality summary", "", "", "", "", ""],
    [
      "Total spreadsheet priorities",
      String(spreadsheetRows.length),
      "",
      "",
      "",
      ""
    ],
    [
      "Correctly on map",
      String(comparisonRows.filter((r) => r["Issue type"] === "OK").length),
      "",
      "",
      "",
      "Spreadsheet GPS is valid and the point appears on the map."
    ],
    [
      "Missing GPS in spreadsheet",
      String(comparisonRows.filter((r) => r["Issue type"] === "Missing GPS coordinates").length),
      "",
      "",
      "",
      "Data provider did not enter coordinates."
    ],
    [
      "Wrong GPS in spreadsheet",
      String(comparisonRows.filter((r) => r["Issue type"] === "Wrong GPS coordinates").length),
      "",
      "",
      "",
      "Coordinates invalid in source file; map cannot plot correctly until corrected."
    ],
    [
      "Root cause for most Shukran comments",
      "",
      "",
      "",
      "",
      "Valid map issues trace back to missing or wrong GPS in the source Excel supplied for mapping. Count mismatches (Clusters 3, 7, 8) largely reflect expectations not matching the actual spreadsheet rows."
    ]
  ];
}

function autoFitColumns(rows) {
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      const length = String(cell ?? "").length;
      widths[index] = Math.min(80, Math.max(widths[index] || 10, length + 2));
    });
  }
  return widths.map((wch) => ({ wch }));
}

function main() {
  const spreadsheetRows = readSpreadsheetRows();
  const mappedPoints = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  const comparisonRows = buildComparisonRows(spreadsheetRows, mappedPoints);
  const issueSummary = buildIssueSummary(comparisonRows);
  const shukranSummary = buildShukranSummary(spreadsheetRows, comparisonRows);

  const workbook = XLSX.utils.book_new();

  const comparisonSheet = XLSX.utils.json_to_sheet(comparisonRows);
  comparisonSheet["!cols"] = autoFitColumns([
    Object.keys(comparisonRows[0] || {}),
    ...comparisonRows.map((row) => Object.values(row))
  ]);
  XLSX.utils.book_append_sheet(workbook, comparisonSheet, "Map comparison");

  const issuesOnly = comparisonRows.filter((row) => row["Issue type"] !== "OK");
  const issuesSheet = XLSX.utils.json_to_sheet(issuesOnly);
  issuesSheet["!cols"] = autoFitColumns([
    Object.keys(issuesOnly[0] || {}),
    ...issuesOnly.map((row) => Object.values(row))
  ]);
  XLSX.utils.book_append_sheet(workbook, issuesSheet, "Issues only");

  const issueSummarySheet = XLSX.utils.aoa_to_sheet(issueSummary);
  issueSummarySheet["!cols"] = autoFitColumns(issueSummary);
  XLSX.utils.book_append_sheet(workbook, issueSummarySheet, "Issue summary");

  const shukranSheet = XLSX.utils.aoa_to_sheet(shukranSummary);
  shukranSheet["!cols"] = autoFitColumns(shukranSummary);
  XLSX.utils.book_append_sheet(workbook, shukranSheet, "Shukran feedback summary");

  try {
    XLSX.writeFile(workbook, outputPath);
    console.log(`Wrote ${outputPath}`);
  } catch (error) {
    if (error.code === "EBUSY") {
      XLSX.writeFile(workbook, fallbackOutputPath);
      console.warn(`Primary report is open; wrote ${fallbackOutputPath}`);
    } else {
      throw error;
    }
  }

  console.log(`Total rows: ${comparisonRows.length}`);
  console.log(`OK: ${comparisonRows.filter((r) => r["Issue type"] === "OK").length}`);
  console.log(`Issues: ${issuesOnly.length}`);
}

main();
