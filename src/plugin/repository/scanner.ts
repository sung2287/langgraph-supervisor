import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export type FileIndexEntry = {
  path: string;
  size: number;
  mtimeMs: number;
  sha1?: string;
};

export type ScanResult = {
  schemaVersion: 1;
  createdAtMs: number;
  scanVersionMs: number;
  ignore: string[];
  fileCount: number;
  totalBytes: number;
  fileIndex: FileIndexEntry[];
};

export interface ScanRepositoryParams {
  repoRootAbs: string;
  nowMs: number;
  ignoreGlobs?: string[];
  computeSha1?: boolean;
}

const DEFAULT_IGNORE_GLOBS = [
  "node_modules/**",
  ".git/**",
  "ops/runtime/**",
  "dist/**",
  "build/**",
  "out/**",
  "coverage/**",
  ".next/**",
  ".turbo/**",
];

const IGNORE_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
]);

function toPosixRel(rootAbs: string, targetAbs: string): string {
  return path.relative(rootAbs, targetAbs).split(path.sep).join("/");
}

function isWithinRoot(rootAbs: string, targetAbs: string): boolean {
  const rel = path.relative(rootAbs, targetAbs);
  return !(rel.startsWith("..") || path.isAbsolute(rel));
}

function isSafeRelativePath(relPosix: string): boolean {
  if (relPosix === "" || relPosix.startsWith("/") || relPosix.includes("\\")) {
    return false;
  }

  const parts = relPosix.split("/");
  return !parts.some((part) => part === ".." || part === "");
}

function shouldIgnorePath(relPosix: string): boolean {
  if (relPosix === "") {
    return false;
  }

  const parts = relPosix.split("/").filter((part) => part !== "");
  if (parts.length === 0) {
    return false;
  }

  if (parts[0] === "ops" && parts[1] === "runtime") {
    return true;
  }

  return parts.some((part) => IGNORE_DIR_NAMES.has(part));
}

async function maybeSha1(absPath: string, computeSha1: boolean): Promise<string | undefined> {
  if (!computeSha1) {
    return undefined;
  }

  const data = await fs.readFile(absPath);
  return crypto.createHash("sha1").update(data).digest("hex");
}

async function walkDirectory(
  repoRootAbs: string,
  dirAbs: string,
  computeSha1: boolean,
  out: FileIndexEntry[],
  visitedDirs: Set<string>
): Promise<void> {
  const dirReal = await fs.realpath(dirAbs).catch(() => null);
  if (!dirReal || !isWithinRoot(repoRootAbs, dirReal)) {
    return;
  }

  if (visitedDirs.has(dirReal)) {
    return;
  }
  visitedDirs.add(dirReal);

  const entries = await fs.readdir(dirAbs, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const entryAbs = path.join(dirAbs, entry.name);
    const relPosix = toPosixRel(repoRootAbs, entryAbs);

    if (!isSafeRelativePath(relPosix) || shouldIgnorePath(relPosix)) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      const linkReal = await fs.realpath(entryAbs).catch(() => null);
      if (!linkReal || !isWithinRoot(repoRootAbs, linkReal)) {
        continue;
      }

      const linkedStat = await fs.stat(linkReal).catch(() => null);
      if (!linkedStat) {
        continue;
      }

      if (linkedStat.isDirectory()) {
        await walkDirectory(repoRootAbs, linkReal, computeSha1, out, visitedDirs);
        continue;
      }

      if (linkedStat.isFile()) {
        out.push({
          path: relPosix,
          size: linkedStat.size,
          mtimeMs: linkedStat.mtimeMs,
          sha1: await maybeSha1(linkReal, computeSha1),
        });
      }
      continue;
    }

    if (entry.isDirectory()) {
      await walkDirectory(repoRootAbs, entryAbs, computeSha1, out, visitedDirs);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stat = await fs.stat(entryAbs);
    out.push({
      path: relPosix,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      sha1: await maybeSha1(entryAbs, computeSha1),
    });
  }
}

export async function scanRepository(params: ScanRepositoryParams): Promise<ScanResult> {
  const repoRootAbs = path.resolve(params.repoRootAbs);
  const computeSha1 = params.computeSha1 ?? false;
  const ignore = [...(params.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS)];

  const fileIndex: FileIndexEntry[] = [];
  await walkDirectory(repoRootAbs, repoRootAbs, computeSha1, fileIndex, new Set<string>());

  fileIndex.sort((a, b) => a.path.localeCompare(b.path));

  const totalBytes = fileIndex.reduce((sum, item) => sum + item.size, 0);

  return {
    schemaVersion: 1,
    createdAtMs: params.nowMs,
    scanVersionMs: params.nowMs,
    ignore,
    fileCount: fileIndex.length,
    totalBytes,
    fileIndex,
  };
}
