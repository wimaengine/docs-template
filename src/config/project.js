import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRootDir = path.resolve(process.cwd());
const packageRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const websiteRootDir = path.resolve(packageRootDir, "src");
const packageJsonPath = path.resolve(projectRootDir, "package.json");
const rawPackageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

function normalizeEntryPath(value) {
  const cleaned = value.trim().replace(/^\.\/+/, "").replace(/^\/+/, "");
  return cleaned || "src/index.js";
}

if (typeof rawPackageJson.name !== "string" || rawPackageJson.name.trim() === "") {
  throw new Error("package.json must define a root package name");
}

export const rootPackageJson = rawPackageJson;
export const rootPackageName = rawPackageJson.name;
export const rootPackageDevUrl = normalizeEntryPath(rawPackageJson.source ?? "src/index.js");
export { packageRootDir, projectRootDir, websiteRootDir };
