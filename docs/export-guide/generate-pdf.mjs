import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.join(__dirname, "screenshots");
const outputPath = path.join(__dirname, "Map-Export-Guide.pdf");

const BRAND = "#1f6b5c";
const TEXT = "#17201e";
const MUTED = "#5b6764";
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const doc = new PDFDocument({
  size: "LETTER",
  margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
  info: {
    Title: "Community Priorities Map — Export Guide",
    Author: "Community Priorities Maps",
    Subject: "How to export cluster priority maps to PNG or PDF"
  }
});

doc.pipe(fs.createWriteStream(outputPath));

function ensureSpace(height) {
  if (doc.y + height > PAGE_HEIGHT - MARGIN) {
    doc.addPage();
  }
}

function heading(text, size = 20) {
  ensureSpace(size + 18);
  doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(size).text(text, { width: CONTENT_WIDTH });
  doc.moveDown(0.35);
}

function subheading(text) {
  ensureSpace(28);
  doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(13).text(text, { width: CONTENT_WIDTH });
  doc.moveDown(0.2);
}

function paragraph(text) {
  ensureSpace(16);
  doc.fillColor(TEXT).font("Helvetica").fontSize(10.5).text(text, {
    width: CONTENT_WIDTH,
    align: "left",
    lineGap: 2
  });
  doc.moveDown(0.45);
}

function bullet(items) {
  items.forEach((item) => {
    ensureSpace(14);
    doc.fillColor(TEXT).font("Helvetica").fontSize(10.5).text(`•  ${item}`, {
      width: CONTENT_WIDTH,
      indent: 12,
      lineGap: 1
    });
  });
  doc.moveDown(0.35);
}

function numbered(items) {
  items.forEach((item, index) => {
    ensureSpace(14);
    doc.fillColor(TEXT).font("Helvetica").fontSize(10.5).text(`${index + 1}.  ${item}`, {
      width: CONTENT_WIDTH,
      lineGap: 1
    });
  });
  doc.moveDown(0.35);
}

function caption(text) {
  doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(9).text(text, {
    width: CONTENT_WIDTH,
    align: "center"
  });
  doc.moveDown(0.5);
}

function addImage(filename, maxHeight = 300) {
  const imagePath = path.join(screenshotsDir, filename);
  if (!fs.existsSync(imagePath)) return;

  const imageWidth = CONTENT_WIDTH;
  const imageHeight = Math.min(maxHeight, imageWidth * 0.52);
  ensureSpace(imageHeight + 28);
  doc.image(imagePath, MARGIN, doc.y, {
    fit: [imageWidth, imageHeight],
    align: "center"
  });
  doc.y += imageHeight;
}

function divider() {
  ensureSpace(12);
  const y = doc.y + 4;
  doc.strokeColor("#d8dfda").lineWidth(1).moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
  doc.moveDown(0.6);
}

// Cover
doc.rect(0, 0, PAGE_WIDTH, 150).fill(BRAND);
doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(28).text("Map Export Guide", MARGIN, 52, {
  width: CONTENT_WIDTH
});
doc.font("Helvetica").fontSize(13).text("Community Priorities Maps", MARGIN, 92);
doc.fillColor(MUTED).fontSize(10).text("Baghlan-e-Jadid & Nawabad, Kunduz", MARGIN, 112);
doc.moveDown(4);
doc.fillColor(TEXT).font("Helvetica").fontSize(11).text(
  "A short reference for exporting professional map layouts from the Cluster Priorities web maps. Covers both map views (with and without Integrated Locations Database assets), map filters, and export to PNG image or PDF.",
  { width: CONTENT_WIDTH, lineGap: 2 }
);
doc.moveDown(1);
paragraph("Production URL: https://d1b6znwb7yuvt4.cloudfront.net");

doc.addPage();
heading("1. Choose your map view");
paragraph(
  "Two related maps share the same export tools. Use the navigation tabs at the bottom of the screen to switch views before exporting."
);
bullet([
  "Cluster Priorities Only — infrastructure priorities and boundary layers only (no ILD asset icons).",
  "Cluster Priorities and Assets — the same priorities plus Integrated Locations Database assets (schools, roads, water points, health facilities, and more)."
]);
addImage("01-cluster-priorities-only-map.png", 280);
caption("Figure 1 — Cluster Priorities Only (boundaries and numbered priorities, no asset layer icons).");
addImage("03-cluster-priorities-with-assets.png", 280);
caption("Figure 2 — Cluster Priorities and Assets (priorities plus blue asset markers and roads).");

doc.addPage();
heading("2. Filter the map before exporting");
paragraph(
  "Use the Filter map panel on the right to control exactly what appears in your export. The export captures the current map view — zoom, pan, filters, visible layers, and basemap — not the sidebar itself."
);
subheading("Base map");
paragraph("Choose the background imagery or street map:");
bullet([
  "OpenStreetMap — standard street map (default).",
  "Satellite imagery — Esri aerial photography; north arrow and scale bar switch to white for readability.",
  "Satellite + labels — aerial imagery with place-name labels.",
  "Topographic — terrain shading from OpenTopoMap.",
  "Light map — minimal Carto light basemap.",
  "Humanitarian OSM — HOT humanitarian styling.",
  "Esri streets — Esri street basemap."
]);
subheading("Cluster");
paragraph(
  "Limits displayed infrastructure priorities and zooms the map to the selected cluster. Choose All clusters for a regional overview, or pick Cluster 1 through Cluster 11 or Nawabad Cluster for a focused export."
);
subheading("Map layers control (top-right)");
paragraph(
  "Open the Layers control on the map to toggle individual asset types (bridges, schools, water wells, etc.) on the assets map, or boundary and priority layers on both maps. Only layers that are turned on are included in the legend and export."
);
addImage("04-filters-cluster1-satellite.png", 300);
caption("Figure 3 — Example: Cluster 1 filtered on satellite imagery with assets visible.");
addImage("05-filter-sidebar.png", 320);
caption("Figure 3b — Filter map panel (base map and cluster selectors).");

doc.addPage();
heading("3. Open the Export panel");
paragraph(
  "After signing in, click the Export button at the bottom-left of the map. The panel lets you customize the printed layout before downloading."
);
addImage("02-export-panel.png", 340);
caption("Figure 4 — Export panel with title, subtitle, quality, label controls, and download buttons.");

subheading("Export options");
bullet([
  "Title — main heading on the exported page (defaults to the map name).",
  "Subtitle — secondary line, often the selected cluster (e.g. Cluster 1 or All clusters).",
  "Quality — High (best resolution), Medium, or Low. Use High for reports and presentations.",
  "Priority labels — adjust text size, words per line, and line height for numbered priority callouts on the map (infrastructure maps only)."
]);

divider();
heading("4. Export to PNG (image)");
numbered([
  "Set your filters, zoom, and pan so the map shows the area you need.",
  "Open Export and review the title and subtitle.",
  "Choose Quality (High recommended).",
  "Click Export PNG.",
  "Wait for the status message “PNG downloaded.” Your browser saves a .png file."
]);
paragraph(
  "The PNG is a high-quality image file suitable for slides, reports, and sharing. It includes a white frame with title, subtitle, map, legend, north arrow, scale bar, attribution, and export timestamp. The sidebar, zoom buttons, and Export button are hidden automatically."
);

divider();
heading("5. Export to PDF");
numbered([
  "Follow the same preparation steps as PNG export.",
  "Click Export PDF instead of Export PNG.",
  "Wait for “PDF downloaded.” Your browser saves a .pdf file."
]);
paragraph(
  "The PDF contains the same layout as the PNG, sized to fit one page (landscape or portrait depending on your screen). Use PDF when you need a print-ready document or a single file for email attachments."
);

doc.addPage();
heading("6. What is included in every export");
bullet([
  "Map title and subtitle at the top of the page.",
  "Current map extent with all visible priorities, boundaries, and asset layers.",
  "Legend listing active layers (bottom-right on the map).",
  "North arrow (top-right) and scale bar (bottom-left).",
  "Attribution footer and export date/time.",
  "Automatic filename based on map name, cluster, and date."
]);
subheading("Tips");
bullet([
  "Pan and zoom first — the export matches what you see on screen.",
  "On satellite basemaps, use High quality for the sharpest result.",
  "Filter to a single cluster for cleaner maps in cluster-specific reports.",
  "On the assets map, turn off unused layer types in the Layers menu to simplify the legend.",
  "If export fails, try a different basemap or refresh the page and sign in again."
]);
subheading("Quick reference");
paragraph("Cluster Priorities Only: /cluster-priorities-map/map.htm");
paragraph("Cluster Priorities and Assets: /cluster-priorities-assets-map/map.htm");

doc.end();

await new Promise((resolve, reject) => {
  doc.on("end", resolve);
  doc.on("error", reject);
});

console.log(`Created ${outputPath}`);
