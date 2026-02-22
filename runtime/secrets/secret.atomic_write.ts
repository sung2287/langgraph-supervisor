import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

async function fsyncDirectoryIfSupported(dirPath: string): Promise<void> {
  let dirHandle: fs.FileHandle | undefined;
  try {
    dirHandle = await fs.open(dirPath, "r");
    await dirHandle.sync();
  } catch {
    return;
  } finally {
    if (dirHandle) {
      await dirHandle.close();
    }
  }
}

export async function writeFileAtomically(
  targetPath: string,
  data: string,
  options: { readonly mode?: number } = {}
): Promise<void> {
  const dirPath = path.dirname(targetPath);
  const fileMode = options.mode ?? 0o600;
  const tempPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;

  await fs.mkdir(dirPath, { recursive: true, mode: 0o700 });

  let fileHandle: fs.FileHandle | undefined;
  try {
    fileHandle = await fs.open(tempPath, "wx", fileMode);
    await fileHandle.writeFile(data, "utf8");
    await fileHandle.sync();
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }

  try {
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }

  await fsyncDirectoryIfSupported(dirPath);
}
