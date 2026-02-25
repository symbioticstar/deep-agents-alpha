import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

import dotenv from "dotenv";

dotenv.config();

interface RepoSpec {
  url: string;
  branch: string;
  targetDir: string;
}

function runGit(args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      stdio: "inherit",
      cwd,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`git ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

function defaultTargetDir(url: string): string {
  const repoName = url
    .split("/")
    .at(-1)
    ?.replace(/\.git$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-");

  return path.resolve(process.cwd(), "skills", "remote", repoName || "skills-repo");
}

function parseEntry(entry: string): RepoSpec {
  const [leftRaw, targetFromSpec] = entry.split("=>").map((part) => part.trim());
  const left = leftRaw ?? "";
  const [url, branch = "main"] = left.split("#").map((part) => part.trim());

  if (!url) {
    throw new Error(`Invalid repo spec: ${entry}`);
  }

  return {
    url,
    branch,
    targetDir: targetFromSpec ? path.resolve(process.cwd(), targetFromSpec) : defaultTargetDir(url),
  };
}

function parseRepoSpecs(raw: string): RepoSpec[] {
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseEntry);
}

async function syncRepository(spec: RepoSpec): Promise<void> {
  if (!existsSync(spec.targetDir)) {
    await runGit(["clone", "--depth", "1", "--branch", spec.branch, spec.url, spec.targetDir]);
    return;
  }

  await runGit(["fetch", "origin", spec.branch, "--prune"], spec.targetDir);
  await runGit(["checkout", spec.branch], spec.targetDir);
  await runGit(["pull", "--ff-only", "origin", spec.branch], spec.targetDir);
}

async function main(): Promise<void> {
  const raw = process.env.REMOTE_SKILLS_REPOS?.trim() ?? "";
  if (!raw) {
    console.error("REMOTE_SKILLS_REPOS is empty. Nothing to sync.");
    return;
  }

  const specs = parseRepoSpecs(raw);
  for (const spec of specs) {
    console.error(`Syncing ${spec.url} -> ${spec.targetDir} (${spec.branch})`);
    await syncRepository(spec);
  }
}

void main();
