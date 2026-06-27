import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../frontend/node_modules/serve-handler/src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(repoRoot, "frontend", "dist");
const layoutSource = join(
  repoRoot,
  "frontend",
  "community-priorities-assets-for-export-src",
  "src",
  "export-callout-layout.js"
);
const layoutDist = join(
  distDir,
  "community-priorities-assets-for-export-map",
  "src",
  "export-callout-layout.js"
);
const port = Number(process.env.PORT || 5173);

function readLayoutFile() {
  if (!existsSync(layoutSource)) return {};
  const raw = readFileSync(layoutSource, "utf8");
  const match = raw.match(/window\.EXPORT_CALLOUT_LAYOUT\s*=\s*(\{[\s\S]*\});?/);
  if (!match) return {};
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    console.warn("Unable to parse export callout layout file:", error);
    return {};
  }
}

function writeLayoutFile(layout) {
  const content = `window.EXPORT_CALLOUT_LAYOUT = ${JSON.stringify(layout, null, 2)};\n`;
  writeFileSync(layoutSource, content, "utf8");
  if (existsSync(dirname(layoutDist))) {
    writeFileSync(layoutDist, content, "utf8");
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/export-callout-layout") {
    try {
      const body = await readJsonBody(req);
      const calloutId = String(body.calloutId || "").trim();
      const offsetPx = body.offsetPx;

      if (!calloutId || !offsetPx || typeof offsetPx.x !== "number" || typeof offsetPx.y !== "number") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "calloutId and offsetPx { x, y } are required." }));
        return;
      }

      const layout = readLayoutFile();
      layout[calloutId] = {
        x: Math.round(offsetPx.x),
        y: Math.round(offsetPx.y)
      };
      writeLayoutFile(layout);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, layout }));
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Unable to save callout layout." }));
      return;
    }
  }

  await handler(req, res, {
    public: distDir,
    cleanUrls: false,
    directoryListing: false,
    trailingSlash: false
  });
}).listen(port, () => {
  console.log(`Map dev server running at http://localhost:${port}`);
  console.log("Export callout positions save to frontend/community-priorities-assets-for-export-src/src/export-callout-layout.js");
});
