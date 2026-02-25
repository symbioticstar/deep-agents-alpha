import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type { Logger } from "../lib/logger.js";

export interface ResolvedSkills {
  filesystemDirs: string[];
  backendSkillSources: string[];
}

function toBackendPath(projectRoot: string, absoluteDir: string): string {
  const relative = path.relative(projectRoot, absoluteDir).split(path.sep).join("/");
  if (!relative || relative === ".") {
    return "/";
  }

  if (relative.startsWith("../")) {
    throw new Error(`Skill directory must be inside project root: ${absoluteDir}`);
  }

  return `/${relative}`;
}

export function resolveSkillSources(options: {
  projectRoot: string;
  requestedDirs: string[];
  remoteSkillsEnabled: boolean;
  logger: Logger;
}): ResolvedSkills {
  const requested = [...options.requestedDirs];
  if (options.remoteSkillsEnabled) {
    requested.push("./skills/remote");
  }

  const filesystemDirs: string[] = [];
  const backendSkillSources: string[] = [];

  for (const rawDir of requested) {
    const absoluteDir = path.resolve(options.projectRoot, rawDir);
    if (!existsSync(absoluteDir)) {
      options.logger.debug("Skill directory does not exist, skipped", { absoluteDir });
      continue;
    }

    const stats = statSync(absoluteDir);
    if (!stats.isDirectory()) {
      options.logger.warn("Skill path is not a directory, skipped", { absoluteDir });
      continue;
    }

    filesystemDirs.push(absoluteDir);
    backendSkillSources.push(toBackendPath(options.projectRoot, absoluteDir));
  }

  const uniqueFilesystemDirs = Array.from(new Set(filesystemDirs));
  const uniqueBackendSources = Array.from(new Set(backendSkillSources));

  options.logger.debug("Resolved skills", {
    uniqueFilesystemDirs,
    uniqueBackendSources,
  });

  return {
    filesystemDirs: uniqueFilesystemDirs,
    backendSkillSources: uniqueBackendSources,
  };
}
