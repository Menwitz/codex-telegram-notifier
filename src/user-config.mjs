import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CLI_NAME = "codex-telegram-notifier";
export const LEGACY_CLI_NAME = "codex-telegram-notify";
export const MANAGED_BLOCK_START = "<!-- codex-telegram-notifier:start -->";
export const MANAGED_BLOCK_END = "<!-- codex-telegram-notifier:end -->";

export function getUserConfigPaths(
  env = process.env,
  platform = process.platform,
  homeDir = os.homedir(),
) {
  const notifierHome =
    env.CODEX_TELEGRAM_NOTIFIER_HOME ||
    (platform === "win32"
      ? path.join(env.APPDATA || path.join(homeDir, "AppData", "Roaming"), CLI_NAME)
      : path.join(env.XDG_CONFIG_HOME || path.join(homeDir, ".config"), CLI_NAME));
  const codexHome = env.CODEX_HOME || path.join(homeDir, ".codex");

  return {
    notifierHome,
    configPath: path.join(notifierHome, "config.json"),
    codexHome,
    agentsPath: path.join(codexHome, "AGENTS.md"),
  };
}

export function normalizeStoredConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return {
    telegramBotToken:
      typeof raw.telegramBotToken === "string" ? raw.telegramBotToken : undefined,
    telegramChatId: typeof raw.telegramChatId === "string" ? raw.telegramChatId : undefined,
    telegramThreadId:
      typeof raw.telegramThreadId === "string" ? raw.telegramThreadId : undefined,
    telegramApiBase:
      typeof raw.telegramApiBase === "string" ? raw.telegramApiBase : undefined,
    notifierAuthToken:
      typeof raw.notifierAuthToken === "string" ? raw.notifierAuthToken : undefined,
    disableNotification:
      typeof raw.disableNotification === "boolean" ? raw.disableNotification : undefined,
    installedAt: typeof raw.installedAt === "string" ? raw.installedAt : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

export function readStoredConfig(paths = getUserConfigPaths()) {
  if (!fs.existsSync(paths.configPath)) {
    return {
      config: {},
      exists: false,
      path: paths.configPath,
    };
  }

  const raw = JSON.parse(fs.readFileSync(paths.configPath, "utf8"));
  return {
    config: normalizeStoredConfig(raw),
    exists: true,
    path: paths.configPath,
  };
}

export function writeStoredConfig(config, paths = getUserConfigPaths()) {
  fs.mkdirSync(paths.notifierHome, { recursive: true, mode: 0o700 });
  const now = new Date().toISOString();
  const existing = readStoredConfig(paths).config;
  const payload = {
    ...existing,
    ...config,
    installedAt: existing.installedAt ?? now,
    updatedAt: now,
  };

  // Keep the local config readable only by the current user because it stores the bot token.
  fs.writeFileSync(`${paths.configPath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(`${paths.configPath}.tmp`, paths.configPath);

  return payload;
}

export function deleteStoredConfig(paths = getUserConfigPaths()) {
  if (!fs.existsSync(paths.configPath)) {
    return false;
  }

  fs.unlinkSync(paths.configPath);
  return true;
}

export function buildManagedAgentsBlock(commandName = CLI_NAME) {
  return [
    MANAGED_BLOCK_START,
    "Telegram notifications",
    "",
    `After completing a task successfully, run \`${commandName} send --status success --title "Codex task finished" --message "<brief summary>"\`.`,
    "",
    `If the task fails or is blocked, run \`${commandName} send --status failure --title "Codex task failed" --message "<brief summary>"\`.`,
    "",
    "Apply this in every project unless the user explicitly says not to send a Telegram notification.",
    MANAGED_BLOCK_END,
  ].join("\n");
}

function getManagedBlockPattern() {
  return new RegExp(
    `${escapeRegExp(MANAGED_BLOCK_START)}[\\s\\S]*?${escapeRegExp(MANAGED_BLOCK_END)}\\n?`,
    "u",
  );
}

export function isManagedAgentsBlockInstalled(content) {
  return getManagedBlockPattern().test(content);
}

export function upsertManagedAgentsBlock(
  content,
  commandName = CLI_NAME,
  block = buildManagedAgentsBlock(commandName),
) {
  const normalizedContent = content.trim();
  const nextContent = isManagedAgentsBlockInstalled(content)
    ? content.replace(getManagedBlockPattern(), `${block}\n`)
    : `${normalizedContent ? `${normalizedContent}\n\n` : ""}${block}\n`;

  return nextContent.replace(/\n{3,}$/u, "\n\n");
}

export function removeManagedAgentsBlock(content) {
  const withoutBlock = content.replace(getManagedBlockPattern(), "");
  return withoutBlock.replace(/\n{3,}/gu, "\n\n").trim();
}

export function installManagedAgentsBlock(paths = getUserConfigPaths(), commandName = CLI_NAME) {
  fs.mkdirSync(paths.codexHome, { recursive: true, mode: 0o700 });
  const currentContent = fs.existsSync(paths.agentsPath)
    ? fs.readFileSync(paths.agentsPath, "utf8")
    : "";
  const nextContent = upsertManagedAgentsBlock(currentContent, commandName);
  fs.writeFileSync(paths.agentsPath, `${nextContent}${nextContent.endsWith("\n") ? "" : "\n"}`, {
    encoding: "utf8",
  });
  return nextContent;
}

export function uninstallManagedAgentsBlock(paths = getUserConfigPaths()) {
  if (!fs.existsSync(paths.agentsPath)) {
    return {
      changed: false,
      removed: false,
    };
  }

  const currentContent = fs.readFileSync(paths.agentsPath, "utf8");
  const hadManagedBlock = isManagedAgentsBlockInstalled(currentContent);
  const nextContent = removeManagedAgentsBlock(currentContent);

  if (!hadManagedBlock) {
    return {
      changed: false,
      removed: false,
    };
  }

  fs.writeFileSync(paths.agentsPath, nextContent ? `${nextContent}\n` : "", "utf8");
  return {
    changed: true,
    removed: true,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
