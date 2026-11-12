import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RootPackageJson } from "../config/project.ts";
import { projectRootDir } from "../config/project.ts";
import { getWebsiteConfig } from "../config/site.ts";

interface PackageInfo {
  root: string;
  repositoryUrl: string | null;
}

const packageInfoCache = new Map<string, PackageInfo>();

function normalizeRepositoryUrl(repository: RootPackageJson["repository"]): string | null {
  const value = typeof repository === "string"
    ? repository
    : repository?.url;

  if (!value?.trim()) {
    return null;
  }

  let url = value.trim()
    .replace(/^git\+/, "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");

  if (!url.startsWith("https://github.com/")) {
    return null;
  }

  return url;
}

function readPackageInfo(packageRoot: string): PackageInfo {
  if (packageInfoCache.has(packageRoot)) {
    return packageInfoCache.get(packageRoot)!;
  }

  const packageJsonPath = path.join(packageRoot, "package.json");
  let packageJson: RootPackageJson | null;

  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as RootPackageJson;
  } catch {
    packageJson = null;
  }

  const info = {
    root: packageRoot,
    repositoryUrl: normalizeRepositoryUrl(packageJson?.repository)
  };
  packageInfoCache.set(packageRoot, info);
  return info;
}

function resolveSourcePath(sourcePath: string): string | null {
  if (!sourcePath.trim()) {
    return null;
  }

  const normalizedPath = sourcePath.replaceAll("\\", "/");
  const projectName = path.basename(projectRootDir);
  const candidates = [];

  if (path.isAbsolute(sourcePath)) {
    candidates.push(path.normalize(sourcePath));
  }

  candidates.push(path.resolve(projectRootDir, normalizedPath.replace(/^\/+/, "")));

  if (normalizedPath.startsWith(`${projectName}/`)) {
    candidates.push(path.resolve(projectRootDir, normalizedPath.slice(projectName.length + 1)));
  }

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function findPackageInfo(sourceFilePath: string): PackageInfo | null {
  let current = path.dirname(sourceFilePath);

  while (current === projectRootDir || current.startsWith(`${projectRootDir}${path.sep}`)) {
    const info = readPackageInfo(current);

    if (info.repositoryUrl) {
      return info;
    }

    if (current === projectRootDir) {
      break;
    }

    current = path.dirname(current);
  }

  return null;
}

function getRepositoryPath(sourceFilePath: string, packageInfo: PackageInfo): string | null {
  const rootInfo = readPackageInfo(projectRootDir);
  const sameRepository = rootInfo.repositoryUrl === packageInfo.repositoryUrl;
  const basePath = sameRepository ? projectRootDir : packageInfo.root;
  const relativePath = path.relative(basePath, sourceFilePath).split(path.sep).join("/");

  return relativePath.startsWith("..") ? null : relativePath;
}

export function getSourceUrl(sourcePath: string | undefined, line?: number): string | null {
  if (!sourcePath) {
    return null;
  }
  const sourceFilePath = resolveSourcePath(sourcePath);

  if (!sourceFilePath) {
    return null;
  }

  const packageInfo = findPackageInfo(sourceFilePath);
  const repositoryPath = packageInfo && getRepositoryPath(sourceFilePath, packageInfo);

  if (!packageInfo?.repositoryUrl || !repositoryPath) {
    return null;
  }

  const encodedPath = repositoryPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const encodedBranch = getWebsiteConfig().sourceBranch
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const lineSuffix = line !== undefined && line > 0 ? `#L${line}` : "";

  return `${packageInfo.repositoryUrl}/blob/${encodedBranch}/${encodedPath}${lineSuffix}`;
}
