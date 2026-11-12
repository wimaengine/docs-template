import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Exports } from "resolve.exports";

export interface RootPackageJson {
  name: string;
  version?: string;
  source?: string;
  main?: string;
  module?: string;
  browser?: Browser;
  exports?: Exports;
  type?: string;
  jsdelivr?: string;
  unpkg?: string;
  repository?: string | { type?: string; url?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const projectRootDir = path.resolve(process.cwd());
const packageRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const websiteRootDir = path.resolve(packageRootDir, "src");
const packageJsonPath = path.resolve(projectRootDir, "package.json");
const rawPackageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as RootPackageJson;

function normalizeEntryPath(value: string): string {
  const cleaned = value.trim().replace(/^\.\/+/, "").replace(/^\/+/, "");
  return cleaned || "src/index.js";
}

export const rootPackageJson = rawPackageJson;
export const rootPackageName = rootPackageJson.name;
export const rootPackageDevUrl = normalizeEntryPath(rawPackageJson.source ?? "src/index.js");
export { packageRootDir, projectRootDir, websiteRootDir };
