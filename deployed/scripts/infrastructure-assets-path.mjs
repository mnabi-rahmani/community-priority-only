import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const deployedDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(deployedDir, "..");

export const infrastructureAssetsRoot = fs.existsSync(
  path.join(repoRoot, "Assets Needed", "Infrastructure list for priority mapping")
)
  ? path.join(repoRoot, "Assets Needed", "Infrastructure list for priority mapping")
  : path.join(deployedDir, "Assets Needed", "Infrastructure list for priority mapping");

export const allAssetsRoot = fs.existsSync(path.join(repoRoot, "Assets Needed"))
  ? path.join(repoRoot, "Assets Needed")
  : path.join(deployedDir, "Assets Needed");

export { deployedDir, repoRoot };
