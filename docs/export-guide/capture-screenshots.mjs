import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.join(__dirname, "screenshots");
const baseUrl = "http://localhost:5173";
const viewport = { width: 1920, height: 1080, deviceScaleFactor: 1 };

fs.mkdirSync(screenshotsDir, { recursive: true });

const shots = [
  {
    file: "01-cluster-priorities-only-map.png",
    url: `${baseUrl}/cluster-priorities-map/map.htm`,
    setup: async (page) => {}
  },
  {
    file: "02-export-panel.png",
    url: `${baseUrl}/cluster-priorities-map/map.htm`,
    setup: async (page) => {
      await page.click("#exportToggleBtn");
      await page.waitForSelector("#mapExportPanel:not([hidden])", { timeout: 10000 });
    }
  },
  {
    file: "03-cluster-priorities-with-assets.png",
    url: `${baseUrl}/cluster-priorities-assets-map/map.htm`,
    setup: async (page) => {}
  },
  {
    file: "04-filters-cluster1-satellite.png",
    url: `${baseUrl}/cluster-priorities-assets-map/map.htm`,
    setup: async (page) => {
      await page.select("#clusterFilter", "Cluster 1");
      await page.select("#basemapFilter", "Satellite imagery");
      await new Promise((r) => setTimeout(r, 2500));
    }
  },
  {
    file: "05-filter-sidebar.png",
    url: `${baseUrl}/cluster-priorities-assets-map/map.htm`,
    setup: async (page) => {
      await page.select("#clusterFilter", "Cluster 1");
      await new Promise((r) => setTimeout(r, 500));
    },
    clipSelector: ".side"
  }
];

async function preparePage(page) {
  await page.evaluate(() => {
    const auth = document.getElementById("authScreen");
    if (auth) auth.style.display = "none";
    document.documentElement.classList.add("cp-auth-known");
  });
  await page.waitForFunction(() => window.communityPrioritiesMap || document.querySelector(".leaflet-tile"), {
    timeout: 20000
  });
  await page.evaluate(async () => {
    if (window.communityPrioritiesMap) {
      window.communityPrioritiesMap.invalidateSize({ animate: false });
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });
}

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME_PATH,
  defaultViewport: viewport,
  args: ["--window-size=1920,1080", "--no-sandbox", "--disable-dev-shm-usage"]
});

try {
  const page = await browser.newPage();
  await page.setViewport(viewport);

  for (const shot of shots) {
    console.log(`Capturing ${shot.file}...`);
    await page.goto(shot.url, { waitUntil: "networkidle2", timeout: 60000 });
    await preparePage(page);
    if (shot.setup) await shot.setup(page);
    await new Promise((r) => setTimeout(r, 1500));

    const output = path.join(screenshotsDir, shot.file);
    if (shot.clipSelector) {
      const element = await page.$(shot.clipSelector);
      if (element) {
        await element.screenshot({ path: output });
      } else {
        await page.screenshot({ path: output, fullPage: false });
      }
    } else {
      await page.screenshot({ path: output, fullPage: false });
    }
    console.log(`  saved ${output}`);
  }
} finally {
  await browser.close();
}

console.log("Done.");
