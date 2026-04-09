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
}) {
  const resolvedStatus = validateStatus(status);
  const sections = [];
  const resolvedTitle =
    trimToUndefined(title) ?? `${STATUS_ICON[resolvedStatus]} Codex notification`;

  sections.push(
    trimToUndefined(title)
      ? `${STATUS_ICON[resolvedStatus]} ${trimToUndefined(title)}`
      : resolvedTitle,
  );

  if (trimToUndefined(message)) {
    sections.push(trimToUndefined(message));
  }
  if (trimToUndefined(details)) {
    sections.push(trimToUndefined(details));
  }
  if (trimToUndefined(command)) {
    sections.push(`command: ${command}`);
  }
  if (trimToUndefined(cwd)) {
    sections.push(`cwd: ${cwd}`);
  }
  if (exitCode !== undefined && exitCode !== null) {
    sections.push(`exit: ${exitCode}`);
  }
  if (trimToUndefined(finishedAt)) {
    sections.push(`finished: ${finishedAt}`);
  }

  return sections.join("\n\n");
}

export function resolveTelegramConfig(options = {}, env = process.env) {
  const token = trimToUndefined(options.token) ?? trimToUndefined(env.TELEGRAM_BOT_TOKEN);
  const chatId = trimToUndefined(options.chatId) ?? trimToUndefined(env.TELEGRAM_CHAT_ID);
  const threadId =
    trimToUndefined(options.threadId) ?? trimToUndefined(env.TELEGRAM_THREAD_ID);
  const disableNotification =
    options.disableNotification ??
    parseBooleanLike(env.TELEGRAM_DISABLE_NOTIFICATION, "TELEGRAM_DISABLE_NOTIFICATION") ??
    false;
  const apiBase =
    trimToUndefined(options.apiBase) ??
    trimToUndefined(env.TELEGRAM_API_BASE) ??
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

  const response = await fetchImpl(`${apiBase.replace(/\/+$/, "")}/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_notification: disableNotification,
      ...(threadId ? { message_thread_id: Number(threadId) } : {}),
    }),
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

export function parseServeArgs(argv) {
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
    trimToUndefined(values.port) ?? trimToUndefined(process.env.NOTIFIER_PORT) ?? "8787",
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port "${values.port}".`);
  }

  const rawPath =
    trimToUndefined(values.path) ?? trimToUndefined(process.env.NOTIFIER_PATH) ?? "/notify";

  return {
    help: values.help === true,
    host:
      trimToUndefined(values.host) ??
      trimToUndefined(process.env.NOTIFIER_LISTEN_HOST) ??
      "127.0.0.1",
    port,
    // Normalize the route once so callers can pass either "notify" or "/notify".
    path: rawPath.startsWith("/") ? rawPath : `/${rawPath}`,
    token: values.token,
    chatId: values["chat-id"],
    threadId: values["thread-id"],
    apiBase: values["api-base"],
    authToken:
      trimToUndefined(values["auth-token"]) ?? trimToUndefined(process.env.NOTIFIER_AUTH_TOKEN),
    disableNotification: values.silent === true,
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

export function renderHelp() {
  return `codex-telegram-notify

Usage:
  node src/index.mjs send [options]
  node src/index.mjs wrap [options] -- <command> [args...]
  node src/index.mjs serve [options]

Commands:
  send    Send a Telegram message immediately
  wrap    Run a command and notify on success/failure
  serve   Start a tiny HTTP endpoint that accepts POST /notify

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
`;
}
