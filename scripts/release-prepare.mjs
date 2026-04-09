#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_DIR = path.resolve(path.dirname(SCRIPT_PATH), "..");
const PACKAGE_JSON_PATH = path.join(PROJECT_DIR, "package.json");
const NPM_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "codex-telegram-npm-cache-"));

export function readReleaseMetadata(packageJsonPath = PACKAGE_JSON_PATH) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const name = typeof pkg.name === "string" ? pkg.name.trim() : "";
  const version = typeof pkg.version === "string" ? pkg.version.trim() : "";

  if (!name || !version) {
    throw new Error(`Expected package name and version in ${packageJsonPath}.`);
  }

  return {
    name,
    version,
    tag: `v${version}`,
  };
}

export function buildReleasePlan({
  name,
  version,
  tag,
  branch = "main",
  dirtyFiles = [],
  tagExists = false,
}) {
  const warnings = [];
  if (dirtyFiles.length > 0) {
    warnings.push(
      `Git worktree is not clean (${dirtyFiles.length} changed path${dirtyFiles.length === 1 ? "" : "s"}).`,
    );
  }
  if (tagExists) {
    warnings.push(`Local git tag ${tag} already exists.`);
  }

  return {
    name,
    version,
    tag,
    branch,
    warnings,
    commands: [
      "git add package.json",
      `git commit -m "build: release ${version}"`,
      `git tag ${tag}`,
      `git push origin ${branch}`,
      `git push origin ${tag}`,
    ],
  };
}

export function renderReleasePlan(plan) {
  const lines = [
    `Release preflight passed for ${plan.name} ${plan.version}`,
    `branch: ${plan.branch}`,
    `tag: ${plan.tag}`,
  ];

  if (plan.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of plan.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push("", "Next commands:");
  for (const command of plan.commands) {
    lines.push(command);
  }

  lines.push(
    "",
    "GitHub Actions will publish from the matching tag if npm trusted publishing is configured.",
  );

  return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(
      `Usage: node scripts/release-prepare.mjs

Run the local release checks for the current package.json version, then print the
exact commit, tag, and push commands needed for the GitHub Actions publish flow.
`,
    );
    return;
  }

  const metadata = readReleaseMetadata();

  // Run the same local checks the publish workflow relies on before printing
  // the version-specific git commands for the current release candidate.
  const checks = [
    ["npm", ["test"]],
    [process.execPath, ["src/index.mjs", "--help"]],
    ["npm", ["pack", "--dry-run"]],
  ];
  for (const [command, args] of checks) {
    runCommand(command, args);
  }

  const plan = buildReleasePlan({
    ...metadata,
    branch: readGitOutput(["branch", "--show-current"]) || "main",
    dirtyFiles: readGitOutput(["status", "--short"])
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    tagExists: readGitOutput(["tag", "--list", metadata.tag]) === metadata.tag,
  });

  process.stdout.write(renderReleasePlan(plan));
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_DIR,
    stdio: "inherit",
    // Keep release preflight independent from any broken global npm cache state.
    env: {
      ...process.env,
      npm_config_cache: NPM_CACHE_DIR,
    },
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function readGitOutput(args) {
  const result = spawnSync("git", args, {
    cwd: PROJECT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}

if (process.argv[1] === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
