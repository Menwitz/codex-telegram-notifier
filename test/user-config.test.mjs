import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CLI_NAME,
  buildManagedAgentsBlock,
  getUserConfigPaths,
  installManagedAgentsBlock,
  readStoredConfig,
  removeManagedAgentsBlock,
  uninstallManagedAgentsBlock,
  upsertManagedAgentsBlock,
  writeStoredConfig,
} from "../src/user-config.mjs";

test("getUserConfigPaths honors explicit home overrides", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-telegram-paths-"));
  assert.deepEqual(
    getUserConfigPaths(
      {
        CODEX_TELEGRAM_NOTIFIER_HOME: path.join(tempHome, "notify"),
        CODEX_HOME: path.join(tempHome, "codex-home"),
      },
      "darwin",
      tempHome,
    ),
    {
      notifierHome: path.join(tempHome, "notify"),
      configPath: path.join(tempHome, "notify", "config.json"),
      codexHome: path.join(tempHome, "codex-home"),
      agentsPath: path.join(tempHome, "codex-home", "AGENTS.md"),
    },
  );
});

test("writeStoredConfig persists normalized config to disk", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-telegram-config-"));
  const paths = {
    notifierHome: path.join(tempRoot, "notify"),
    configPath: path.join(tempRoot, "notify", "config.json"),
    codexHome: path.join(tempRoot, "codex"),
    agentsPath: path.join(tempRoot, "codex", "AGENTS.md"),
  };

  writeStoredConfig(
    {
      telegramBotToken: "token",
      telegramChatId: "chat",
      notifierAuthToken: "auth",
    },
    paths,
  );

  const stored = readStoredConfig(paths);
  assert.equal(stored.exists, true);
  assert.equal(stored.config.telegramBotToken, "token");
  assert.equal(stored.config.telegramChatId, "chat");
  assert.equal(stored.config.notifierAuthToken, "auth");
  assert.ok(stored.config.installedAt);
  assert.ok(stored.config.updatedAt);
});

test("upsertManagedAgentsBlock appends and replaces the managed block", () => {
  const original = "Existing rule\n";
  const firstPass = upsertManagedAgentsBlock(original, CLI_NAME);
  assert.match(firstPass, /Existing rule/);
  assert.match(firstPass, /codex-telegram-notifier:start/);

  const secondPass = upsertManagedAgentsBlock(firstPass, "custom-command");
  assert.match(secondPass, /custom-command send --status success/);
  assert.equal(
    secondPass.includes("codex-telegram-notifier send --status success"),
    false,
  );
});

test("removeManagedAgentsBlock leaves surrounding content intact", () => {
  const content = [
    "Line before",
    "",
    buildManagedAgentsBlock(CLI_NAME),
    "",
    "Line after",
    "",
  ].join("\n");

  assert.equal(removeManagedAgentsBlock(content), "Line before\n\nLine after");
});

test("installManagedAgentsBlock and uninstallManagedAgentsBlock manage AGENTS.md", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-telegram-agents-"));
  const paths = {
    notifierHome: path.join(tempRoot, "notify"),
    configPath: path.join(tempRoot, "notify", "config.json"),
    codexHome: path.join(tempRoot, "codex"),
    agentsPath: path.join(tempRoot, "codex", "AGENTS.md"),
  };

  fs.mkdirSync(paths.codexHome, { recursive: true });
  fs.writeFileSync(paths.agentsPath, "Existing rule\n", "utf8");

  installManagedAgentsBlock(paths, CLI_NAME);
  const installed = fs.readFileSync(paths.agentsPath, "utf8");
  assert.match(installed, /Existing rule/);
  assert.match(installed, /codex-telegram-notifier:start/);

  const result = uninstallManagedAgentsBlock(paths);
  assert.deepEqual(result, {
    changed: true,
    removed: true,
  });
  assert.equal(fs.readFileSync(paths.agentsPath, "utf8"), "Existing rule\n");
});
