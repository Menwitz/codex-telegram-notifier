import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";

const STATUS_ICON = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  failure: "❌",
};
const STRUCTURED_RESULT_ITEM_FIELDS = ["label", "title", "name", "path", "url", "value"];
const MAX_NOTIFICATION_LENGTH = 3500;
const MAX_SECTION_LINES = 12;
const MAX_SECTION_LENGTH = 900;
const MAX_STRUCTURED_ITEMS = 6;
const MAX_LINE_LENGTH = 240;

export function splitDoubleDash(argv) {
  const separatorIndex = argv.indexOf("--");
  if (separatorIndex === -1) {
    return {
      before: argv,
      after: [],
    };
  }

  return {
    before: argv.slice(0, separatorIndex),
    after: argv.slice(separatorIndex + 1),
  };
}

export function trimToUndefined(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

export function parseDotenv(content) {
  const result = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!key) {
      continue;
    }

    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

export function loadProjectEnv(projectDir, targetEnv = process.env) {
  for (const filename of [".env", ".env.local"]) {
    const filePath = path.join(projectDir, filename);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const parsed = parseDotenv(fs.readFileSync(filePath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      // Respect explicitly exported shell env vars over local file defaults.
      if (targetEnv[key] === undefined) {
        targetEnv[key] = value;
      }
    }
  }

  return targetEnv;
}

export function parseBooleanLike(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(
    `Invalid ${fieldName} value "${value}". Use true/false, yes/no, on/off, or 1/0.`,
  );
}

export function validateStatus(status) {
  const normalized = trimToUndefined(status) ?? "info";
  if (!Object.hasOwn(STATUS_ICON, normalized)) {
    throw new Error(`Invalid status "${status}". Use info, success, warning, or failure.`);
  }
  return normalized;
}

export function renderNotificationText({
  status,
  title,
  message,
  details,
  command,
  cwd,
  exitCode,
  finishedAt,
  artifacts,
  urls,
  nextAction,
}) {
  const result = normalizeNotificationResult({
    status,
    title,
    message,
    details,
    command,
    cwd,
    exitCode,
    finishedAt,
    artifacts,
    urls,
    nextAction,
  });
  const resolvedStatus = result.status;
  const sections = [];
  const resolvedTitle =
    trimToUndefined(result.title) ?? `${STATUS_ICON[resolvedStatus]} Codex notification`;

  sections.push(
    trimToUndefined(result.title)
      ? `${STATUS_ICON[resolvedStatus]} ${trimToUndefined(result.title)}`
      : resolvedTitle,
  );

  if (trimToUndefined(result.message)) {
    sections.push(formatMultilineSection(result.message));
  }
  if (trimToUndefined(result.details)) {
    sections.push(formatMultilineSection(result.details));
  }
  if (result.artifacts.length > 0) {
    sections.push(renderStructuredResultSection("artifacts", result.artifacts));
  }
  if (result.urls.length > 0) {
    sections.push(renderStructuredResultSection("urls", result.urls));
  }
  if (trimToUndefined(result.nextAction)) {
    sections.push(`next action: ${result.nextAction}`);
  }
  if (trimToUndefined(result.command)) {
    sections.push(`command: ${truncateLine(result.command)}`);
  }
  if (trimToUndefined(result.cwd)) {
    sections.push(`cwd: ${truncateLine(result.cwd)}`);
  }
  if (result.exitCode !== undefined) {
    sections.push(`exit: ${result.exitCode}`);
  }
  if (trimToUndefined(result.finishedAt)) {
    sections.push(`finished: ${truncateLine(result.finishedAt)}`);
  }

  return clampNotificationText(sections.join("\n\n"));
}

export function normalizeNotificationResult(input = {}, overrides = {}) {
  const payload = {
    ...(isPlainObject(input) ? input : {}),
    ...(isPlainObject(overrides) ? overrides : {}),
  };

  return {
    status: validateStatus(payload.status),
    title: trimToUndefined(payload.title),
    message: trimToUndefined(payload.message),
    details: trimToUndefined(payload.details),
    command: trimToUndefined(payload.command),
    cwd: trimToUndefined(payload.cwd),
    exitCode: normalizeExitCode(payload.exitCode),
    finishedAt: trimToUndefined(payload.finishedAt),
    artifacts: normalizeStructuredResultItems(payload.artifacts),
    urls: normalizeStructuredResultItems(payload.urls),
    nextAction: trimToUndefined(payload.nextAction ?? payload.next_action),
  };
}

export function resolveTelegramConfig(options = {}, env = process.env) {
  const defaults = options.defaults ?? {};
  const token =
    trimToUndefined(options.token) ??
    trimToUndefined(env.TELEGRAM_BOT_TOKEN) ??
    trimToUndefined(defaults.telegramBotToken);
  const chatId =
    trimToUndefined(options.chatId) ??
    trimToUndefined(env.TELEGRAM_CHAT_ID) ??
    trimToUndefined(defaults.telegramChatId);
  const threadId =
    trimToUndefined(options.threadId) ??
    trimToUndefined(env.TELEGRAM_THREAD_ID) ??
    trimToUndefined(defaults.telegramThreadId);
  const disableNotification =
    options.disableNotification ??
    parseBooleanLike(env.TELEGRAM_DISABLE_NOTIFICATION, "TELEGRAM_DISABLE_NOTIFICATION") ??
    defaults.disableNotification ??
    false;
  const apiBase =
    trimToUndefined(options.apiBase) ??
    trimToUndefined(env.TELEGRAM_API_BASE) ??
    trimToUndefined(defaults.telegramApiBase) ??
    "https://api.telegram.org";

  if (!token) {
    throw new Error("Missing Telegram bot token. Set TELEGRAM_BOT_TOKEN or pass --token.");
  }
  if (!chatId) {
    throw new Error("Missing Telegram chat id. Set TELEGRAM_CHAT_ID or pass --chat-id.");
  }

  return {
    token,
    chatId,
    threadId,
    disableNotification,
    apiBase: apiBase.replace(/\/+$/, ""),
  };
}

export async function callTelegramApi({
  token,
  apiBase = "https://api.telegram.org",
  method,
  body,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("This runtime does not provide fetch. Use Node 20+.");
  }

  const response = await fetchImpl(`${apiBase.replace(/\/+$/, "")}/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body
      ? {
          "content-type": "application/json",
        }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    const description =
      payload?.description ||
      `Telegram API request failed with HTTP ${response.status} ${response.statusText}`;
    throw new Error(description);
  }

  return payload.result;
}

export async function sendTelegramMessage({
  token,
  chatId,
  threadId,
  disableNotification = false,
  apiBase = "https://api.telegram.org",
  text,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("This runtime does not provide fetch. Use Node 20+.");
  }

  return await callTelegramApi({
    token,
    apiBase,
    method: "sendMessage",
    body: {
      chat_id: chatId,
      text,
      disable_notification: disableNotification,
      ...(threadId ? { message_thread_id: Number(threadId) } : {}),
    },
    fetchImpl,
  });
}

export function parseSendArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      token: { type: "string" },
      "chat-id": { type: "string" },
      "thread-id": { type: "string" },
      "api-base": { type: "string" },
      status: { type: "string" },
      title: { type: "string" },
      message: { type: "string" },
      details: { type: "string" },
      "result-file": { type: "string" },
      silent: { type: "boolean" },
      "json-stdin": { type: "boolean" },
    },
  });

  if (positionals.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positionals.join(" ")}`);
  }

  return {
    help: values.help === true,
    token: values.token,
    chatId: values["chat-id"],
    threadId: values["thread-id"],
    apiBase: values["api-base"],
    status: values.status,
    title: values.title,
    message: values.message,
    details: values.details,
    resultFile: values["result-file"],
    disableNotification: values.silent === true,
    jsonStdin: values["json-stdin"] === true,
  };
}

export function parseWrapArgs(argv) {
  const { before, after } = splitDoubleDash(argv);
  const { values, positionals } = parseArgs({
    args: before,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      token: { type: "string" },
      "chat-id": { type: "string" },
      "thread-id": { type: "string" },
      "api-base": { type: "string" },
      title: { type: "string" },
      message: { type: "string" },
      details: { type: "string" },
      "success-message": { type: "string" },
      "failure-message": { type: "string" },
      "only-failures": { type: "boolean" },
      silent: { type: "boolean" },
    },
  });

  const commandArgs = [...positionals, ...after];
  if (commandArgs.length === 0 && values.help !== true) {
    throw new Error('wrap requires a command. Use "wrap -- <command> [args...]"');
  }

  return {
    help: values.help === true,
    token: values.token,
    chatId: values["chat-id"],
    threadId: values["thread-id"],
    apiBase: values["api-base"],
    title: values.title,
    message: values.message,
    details: values.details,
    successMessage: values["success-message"],
    failureMessage: values["failure-message"],
    onlyFailures: values["only-failures"] === true,
    disableNotification: values.silent === true,
    commandArgs,
  };
}

export function parseServeArgs(argv, env = process.env, defaults = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      host: { type: "string" },
      port: { type: "string" },
      path: { type: "string" },
      token: { type: "string" },
      "auth-token": { type: "string" },
      "chat-id": { type: "string" },
      "thread-id": { type: "string" },
      "api-base": { type: "string" },
      silent: { type: "boolean" },
    },
  });

  if (positionals.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positionals.join(" ")}`);
  }

  const port = Number(
    trimToUndefined(values.port) ?? trimToUndefined(env.NOTIFIER_PORT) ?? "8787",
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port "${values.port}".`);
  }

  const rawPath =
    trimToUndefined(values.path) ?? trimToUndefined(env.NOTIFIER_PATH) ?? "/notify";

  return {
    help: values.help === true,
    host: trimToUndefined(values.host) ?? trimToUndefined(env.NOTIFIER_LISTEN_HOST) ?? "127.0.0.1",
    port,
    // Normalize the route once so callers can pass either "notify" or "/notify".
    path: rawPath.startsWith("/") ? rawPath : `/${rawPath}`,
    token: values.token,
    chatId: values["chat-id"],
    threadId: values["thread-id"],
    apiBase: values["api-base"],
    authToken:
      trimToUndefined(values["auth-token"]) ??
      trimToUndefined(env.NOTIFIER_AUTH_TOKEN) ??
      trimToUndefined(defaults.notifierAuthToken),
    disableNotification: values.silent === true,
  };
}

export function parseInstallArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      token: { type: "string" },
      "chat-id": { type: "string" },
      "thread-id": { type: "string" },
      "api-base": { type: "string" },
      "auth-token": { type: "string" },
      mode: { type: "string" },
      silent: { type: "boolean" },
      "skip-agents": { type: "boolean" },
    },
  });

  if (positionals.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positionals.join(" ")}`);
  }

  return {
    help: values.help === true,
    token: values.token,
    chatId: values["chat-id"],
    threadId: values["thread-id"],
    apiBase: values["api-base"],
    authToken: values["auth-token"],
    mode: values.mode,
    disableNotification: values.silent === true,
    skipAgents: values["skip-agents"] === true,
  };
}

export function parsePrintInstructionsArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      mode: { type: "string" },
    },
  });

  if (positionals.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positionals.join(" ")}`);
  }

  return {
    help: values.help === true,
    mode: values.mode,
  };
}

export function parseUninstallArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      "delete-config": { type: "boolean" },
    },
  });

  if (positionals.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positionals.join(" ")}`);
  }

  return {
    help: values.help === true,
    deleteConfig: values["delete-config"] === true,
  };
}

export function parseDoctorArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      "send-test": { type: "boolean" },
    },
  });

  if (positionals.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positionals.join(" ")}`);
  }

  return {
    help: values.help === true,
    sendTest: values["send-test"] === true,
  };
}

export function parseJsonInput(raw) {
  const trimmed = trimToUndefined(raw);
  if (!trimmed) {
    throw new Error("Expected JSON on stdin.");
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `Invalid JSON input: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function readJsonFile(filePath) {
  const resolvedPath = trimToUndefined(filePath);
  if (!resolvedPath) {
    throw new Error("Expected a result file path.");
  }

  return parseJsonInput(fs.readFileSync(resolvedPath, "utf8"));
}

export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function runCommand(commandArgs, spawnImpl = spawn) {
  const [command, ...args] = commandArgs;
  const startedAt = new Date();

  return await new Promise((resolve, reject) => {
    // Stream the wrapped command directly so Codex keeps normal command visibility.
    const child = spawnImpl(command, args, {
      stdio: "inherit",
      env: process.env,
      cwd: process.cwd(),
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve({
        command,
        args,
        code: code ?? 1,
        signal: signal ?? null,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
      });
    });
  });
}

export function requireBearerToken(headers, expectedToken) {
  if (!expectedToken) {
    return true;
  }

  const authorization = trimToUndefined(headers.authorization);
  const headerToken = trimToUndefined(headers["x-notify-token"]);
  const bearerToken =
    authorization && authorization.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : undefined;

  return bearerToken === expectedToken || headerToken === expectedToken;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function normalizeExitCode(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized = Number(value);
  if (!Number.isInteger(normalized)) {
    throw new Error(`Invalid exitCode "${value}". Use an integer.`);
  }

  return normalized;
}

function normalizeStructuredResultItems(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeStructuredResultItems(item));
  }

  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }

  if (!isPlainObject(value)) {
    throw new Error("Structured result fields must be strings, arrays, or objects.");
  }

  const hasDirectFields = STRUCTURED_RESULT_ITEM_FIELDS.some((field) => field in value);
  if (hasDirectFields) {
    const label = trimToUndefined(value.label ?? value.title ?? value.name);
    const resolvedValue = trimToUndefined(value.path ?? value.url ?? value.value);
    if (!resolvedValue) {
      throw new Error("Structured result items must include a value, path, or url.");
    }
    return [label ? `${label}: ${resolvedValue}` : resolvedValue];
  }

  return Object.entries(value).flatMap(([label, itemValue]) => {
    const resolvedValue = trimToUndefined(itemValue);
    if (!resolvedValue) {
      return [];
    }
    return [`${label}: ${resolvedValue}`];
  });
}

function renderStructuredResultSection(title, items) {
  const visibleItems = items.slice(0, MAX_STRUCTURED_ITEMS).map((item) => `- ${truncateLine(item)}`);
  if (items.length > MAX_STRUCTURED_ITEMS) {
    visibleItems.push(`- ... (${items.length - MAX_STRUCTURED_ITEMS} more)`);
  }
  return `${title}:\n${visibleItems.join("\n")}`;
}

function formatMultilineSection(value) {
  const normalized = trimToUndefined(value);
  if (!normalized) {
    return undefined;
  }

  const lines = normalized.split(/\r?\n/u).map((line) => truncateLine(line));
  const visibleLines = lines.slice(0, MAX_SECTION_LINES);
  let section = visibleLines.join("\n");

  if (lines.length > MAX_SECTION_LINES) {
    section = `${section}\n... (${lines.length - MAX_SECTION_LINES} more lines)`;
  }

  if (section.length > MAX_SECTION_LENGTH) {
    section = `${section.slice(0, MAX_SECTION_LENGTH - 18).trimEnd()}\n... (truncated)`;
  }

  return section;
}

function truncateLine(value, maxLength = MAX_LINE_LENGTH) {
  const normalized = trimToUndefined(value);
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 15).trimEnd()}... (truncated)`;
}

function clampNotificationText(value) {
  if (value.length <= MAX_NOTIFICATION_LENGTH) {
    return value;
  }

  // Leave headroom below Telegram's hard cap so appended truncation markers still fit.
  return `${value.slice(0, MAX_NOTIFICATION_LENGTH - 18).trimEnd()}\n\n... (truncated)`;
}

export function renderHelp() {
  return `codex-telegram-notifier

Usage:
  codex-telegram-notifier install [options]
  codex-telegram-notifier print-instructions [options]
  codex-telegram-notifier uninstall [options]
  codex-telegram-notifier doctor [options]
  codex-telegram-notifier send [options]
  codex-telegram-notifier wrap [options] -- <command> [args...]
  codex-telegram-notifier serve [options]

Commands:
  install             Save notifier config and add a managed block to ~/.codex/AGENTS.md
  print-instructions  Print a reusable Codex instruction block for a notification mode
  uninstall           Remove the managed Codex block and optionally delete stored config
  doctor              Validate the stored config, Telegram access, and Codex wiring
  send                Send a Telegram message immediately
  wrap                Run a command and notify on success/failure
  serve               Start a tiny HTTP endpoint that accepts POST /notify

Environment:
  TELEGRAM_BOT_TOKEN
  TELEGRAM_CHAT_ID
  TELEGRAM_THREAD_ID
  TELEGRAM_DISABLE_NOTIFICATION
  TELEGRAM_API_BASE
  NOTIFIER_LISTEN_HOST
  NOTIFIER_PORT
  NOTIFIER_PATH
  NOTIFIER_AUTH_TOKEN
  CODEX_HOME
  CODEX_TELEGRAM_NOTIFIER_HOME
`;
}
