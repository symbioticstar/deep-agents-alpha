import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { FileData } from "deepagents";

import type { Logger } from "./logger.js";

export type VirtualFiles = Record<string, FileData>;

function toVirtualPath(projectRoot: string, absolutePath: string): string {
  const relative = path.relative(projectRoot, absolutePath).split(path.sep).join("/");
  if (!relative || relative.startsWith("../")) {
    throw new Error(`File is outside project root: ${absolutePath}`);
  }
  return `/${relative}`;
}

async function walkFiles(dir: string): Promise<string[]> {
  const queue = [dir];
  const files: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }

  return files;
}

export async function loadVirtualFilesFromDirectories(options: {
  projectRoot: string;
  directories: string[];
  logger: Logger;
}): Promise<VirtualFiles> {
  const virtualFiles: VirtualFiles = {};

  for (const directory of options.directories) {
    const files = await walkFiles(directory);
    for (const absoluteFilePath of files) {
      let virtualPath: string;
      try {
        virtualPath = toVirtualPath(options.projectRoot, absoluteFilePath);
      } catch (error) {
        options.logger.debug("Skip file outside project root", {
          absoluteFilePath,
          error,
        });
        continue;
      }

      try {
        const [stats, content] = await Promise.all([
          stat(absoluteFilePath),
          readFile(absoluteFilePath, "utf8"),
        ]);

        virtualFiles[virtualPath] = {
          content: content.split(/\r?\n/),
          created_at: stats.birthtime.toISOString(),
          modified_at: stats.mtime.toISOString(),
        };
      } catch (error) {
        options.logger.debug("Skip unreadable skill file", {
          absoluteFilePath,
          error,
        });
      }
    }
  }

  return virtualFiles;
}
