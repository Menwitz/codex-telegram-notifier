import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildReleasePlan,
  readReleaseMetadata,
  renderReleasePlan,
} from "../scripts/release-prepare.mjs";

test("readReleaseMetadata reads package name and version", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-telegram-release-meta-"));
  const packageJsonPath = path.join(tempDir, "package.json");
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify({
      name: "codex-telegram-notifier",
      version: "0.2.5",
    }),
    "utf8",
  );

  assert.deepEqual(readReleaseMetadata(packageJsonPath), {
    name: "codex-telegram-notifier",
    version: "0.2.5",
    tag: "v0.2.5",
  });
});

test("buildReleasePlan includes warnings and commands", () => {
  const plan = buildReleasePlan({
    name: "codex-telegram-notifier",
    version: "0.2.5",
    tag: "v0.2.5",
    branch: "main",
    dirtyFiles: ["M package.json"],
    tagExists: true,
  });

  assert.deepEqual(plan.commands, [
    "git add package.json",
    'git commit -m "build: release 0.2.5"',
    "git tag v0.2.5",
    "git push origin main",
    "git push origin v0.2.5",
  ]);
  assert.match(plan.warnings[0], /Git worktree is not clean/);
  assert.match(plan.warnings[1], /Local git tag v0.2.5 already exists/);
});

test("renderReleasePlan produces a readable checklist", () => {
  const output = renderReleasePlan(
    buildReleasePlan({
      name: "codex-telegram-notifier",
      version: "0.2.5",
      tag: "v0.2.5",
      branch: "main",
      dirtyFiles: [],
      tagExists: false,
    }),
  );

  assert.match(output, /Release preflight passed for codex-telegram-notifier 0.2.5/);
  assert.match(output, /git commit -m "build: release 0.2.5"/);
  assert.match(output, /git push origin v0.2.5/);
  assert.match(output, /GitHub Actions will publish from the matching tag/);
});
