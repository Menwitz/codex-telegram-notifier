#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  callTelegramApi,
  parsePrintInstructionsArgs,
  loadProjectEnv,
  parseDoctorArgs,
  parseInstallArgs,
  parseJsonInput,
  parseSendArgs,
  parseServeArgs,
  parseUninstallArgs,
  parseWrapArgs,
  readStdin,
  renderHelp,
  renderNotificationText,
  requireBearerToken,
  resolveTelegramConfig,
  runCommand,
  sendTelegramMessage,
  trimToUndefined,
  validateStatus,
} from "./lib.mjs";
import {
  buildInstructionBlock,
  CLI_NAME,
  DEFAULT_INSTALL_MODE,
  DEFAULT_PRINT_INSTRUCTIONS_MODE,
  deleteStoredConfig,
  getUserConfigPaths,
  installManagedAgentsBlock,
  isManagedAgentsBlockInstalled,
  readStoredConfig,
  resolveInstructionMode,
  uninstallManagedAgentsBlock,
  writeStoredConfig,
} from "./user-config.mjs";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadProjectEnv(PROJECT_DIR, process.env);
const USER_CONFIG_PATHS = getUserConfigPaths();

function getStoredConfig() {
  return readStoredConfig(USER_CONFIG_PATHS).config;
}

async function handleSend(argv) {
  const options = parseSendArgs(argv);
  if (options.help) {
    process.stdout.write(
      `Usage: ${CLI_NAME} send [options]

Options:
  --title <text>
  --message <text>
  --details <text>
  --status <info|success|warning|failure>
  --token <bot-token>
  --chat-id <chat-id>
  --thread-id <topic-id>
  --api-base <url>
  --silent
  --json-stdin
  -h, --help
`,
    );
    return;
  }

  const stdinPayload = options.jsonStdin ? parseJsonInput(await readStdin()) : {};
  const status = validateStatus(options.status ?? stdinPayload.status);
  const text = renderNotificationText({
    status,
    title: options.title ?? stdinPayload.title,
    message: options.message ?? stdinPayload.message,
    details: options.details ?? stdinPayload.details,
  });

  if (!trimToUndefined(text)) {
    throw new Error("Notification text is empty.");
  }

  const config = resolveTelegramConfig({
    token: options.token ?? stdinPayload.token,
    chatId: options.chatId ?? stdinPayload.chatId ?? stdinPayload.chat_id,
    threadId: options.threadId ?? stdinPayload.threadId ?? stdinPayload.thread_id,
    apiBase: options.apiBase ?? stdinPayload.apiBase,
    disableNotification:
      options.disableNotification === true
        ? true
        : stdinPayload.disableNotification ?? stdinPayload.silent,
    defaults: getStoredConfig(),
  });

  const result = await sendTelegramMessage({
    ...config,
    text,
  });
  process.stdout.write(`${JSON.stringify({ ok: true, messageId: result.message_id }, null, 2)}\n`);
}

async function handleWrap(argv) {
  const options = parseWrapArgs(argv);
  if (options.help) {
    process.stdout.write(
      `Usage: ${CLI_NAME} wrap [options] -- <command> [args...]

Options:
  --title <text>
  --message <text>
  --details <text>
  --success-message <text>
  --failure-message <text>
  --only-failures
  --token <bot-token>
  --chat-id <chat-id>
  --thread-id <topic-id>
  --api-base <url>
  --silent
  -h, --help
`,
    );
    return;
  }

  const result = await runCommand(options.commandArgs);
  const failed = result.code !== 0 || result.signal !== null;

  if (!failed && options.onlyFailures) {
    process.exit(result.code);
    return;
  }

  const status = failed ? "failure" : "success";
  const defaultMessage = failed
    ? options.failureMessage ?? "Wrapped command failed."
    : options.successMessage ?? "Wrapped command finished successfully.";
  const text = renderNotificationText({
    status,
    title: options.title ?? "Codex wrapped command",
    message: options.message ?? defaultMessage,
    details: options.details,
    command: [result.command, ...result.args].join(" "),
    cwd: process.cwd(),
    exitCode: result.code,
    finishedAt: result.finishedAt,
  });

  const config = resolveTelegramConfig({
    token: options.token,
    chatId: options.chatId,
    threadId: options.threadId,
    apiBase: options.apiBase,
    disableNotification: options.disableNotification,
    defaults: getStoredConfig(),
  });

  try {
    await sendTelegramMessage({
      ...config,
      text,
    });
  } catch (error) {
    process.stderr.write(
      `Failed to send Telegram notification: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
  }

  process.exit(result.code);
}

async function handleServe(argv) {
  const options = parseServeArgs(argv, process.env, getStoredConfig());
  if (options.help) {
    process.stdout.write(
      `Usage: ${CLI_NAME} serve [options]

Options:
  --host <host>
  --port <port>
  --path <path>
  --auth-token <token>
  --token <bot-token>
  --chat-id <chat-id>
  --thread-id <topic-id>
  --api-base <url>
  --silent
  -h, --help
`,
    );
    return;
  }

  const config = resolveTelegramConfig({
    token: options.token,
    chatId: options.chatId,
    threadId: options.threadId,
    apiBase: options.apiBase,
    disableNotification: options.disableNotification,
    defaults: getStoredConfig(),
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== "POST" || req.url !== options.path) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "not found" }));
        return;
      }

      if (!requireBearerToken(req.headers, options.authToken)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
        return;
      }

      const rawBody = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
      });
      const payload = parseJsonInput(rawBody);
      const text = renderNotificationText({
        status: validateStatus(payload.status),
        title: payload.title,
        message: payload.message,
        details: payload.details,
        command: payload.command,
        cwd: payload.cwd,
        exitCode: payload.exitCode,
        finishedAt: payload.finishedAt,
      });

      const result = await sendTelegramMessage({
        ...config,
        text,
        chatId: trimToUndefined(payload.chatId) ?? config.chatId,
        threadId: trimToUndefined(payload.threadId) ?? config.threadId,
        disableNotification:
          payload.disableNotification === true || payload.silent === true
            ? true
            : config.disableNotification,
      });

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, messageId: result.message_id }));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });

  await new Promise((resolve) => {
    server.listen(options.port, options.host, resolve);
  });

  process.stdout.write(
    `Notifier server listening on http://${options.host}:${options.port}${options.path}\n`,
  );
}

async function handleInstall(argv) {
  const options = parseInstallArgs(argv);
  if (options.help) {
    process.stdout.write(
      `Usage: ${CLI_NAME} install [options]

Options:
  --token <bot-token>
  --chat-id <chat-id>
  --thread-id <topic-id>
  --api-base <url>
  --auth-token <token>
  --mode <basic|rich|automation>
  --silent
  --skip-agents
  -h, --help
`,
    );
    return;
  }

  const storedConfig = getStoredConfig();
  const mode = resolveInstructionMode(options.mode ?? storedConfig.codexInstructionMode, DEFAULT_INSTALL_MODE);
  const config = resolveTelegramConfig({
    token: options.token,
    chatId: options.chatId,
    threadId: options.threadId,
    apiBase: options.apiBase,
    disableNotification: options.disableNotification,
    defaults: storedConfig,
  });

  const authToken =
    trimToUndefined(options.authToken) ??
    trimToUndefined(process.env.NOTIFIER_AUTH_TOKEN) ??
    trimToUndefined(storedConfig.notifierAuthToken) ??
    crypto.randomUUID();

  const savedConfig = writeStoredConfig(
    {
      telegramBotToken: config.token,
      telegramChatId: config.chatId,
      telegramThreadId: config.threadId,
      telegramApiBase: config.apiBase,
      notifierAuthToken: authToken,
      disableNotification: config.disableNotification,
      codexInstructionMode: mode,
    },
    USER_CONFIG_PATHS,
  );

  if (!options.skipAgents) {
    installManagedAgentsBlock(USER_CONFIG_PATHS, CLI_NAME, mode);
  }

  process.stdout.write(
    [
      "Installed codex-telegram-notifier.",
      `config: ${USER_CONFIG_PATHS.configPath}`,
      options.skipAgents
        ? "AGENTS.md: skipped"
        : `AGENTS.md: ${USER_CONFIG_PATHS.agentsPath}`,
      `mode: ${mode}`,
      `chat id: ${savedConfig.telegramChatId}`,
    ].join("\n") + "\n",
  );
}

async function handlePrintInstructions(argv) {
  const options = parsePrintInstructionsArgs(argv);
  if (options.help) {
    process.stdout.write(
      `Usage: ${CLI_NAME} print-instructions [options]

Options:
  --mode <basic|rich|automation>
  -h, --help
`,
    );
    return;
  }

  const storedConfig = getStoredConfig();
  const mode = resolveInstructionMode(
    options.mode ?? storedConfig.codexInstructionMode,
    DEFAULT_PRINT_INSTRUCTIONS_MODE,
  );

  process.stdout.write(`${buildInstructionBlock(CLI_NAME, mode)}\n`);
}

async function handleUninstall(argv) {
  const options = parseUninstallArgs(argv);
  if (options.help) {
    process.stdout.write(
      `Usage: ${CLI_NAME} uninstall [options]

Options:
  --delete-config
  -h, --help
`,
    );
    return;
  }

  const uninstallResult = uninstallManagedAgentsBlock(USER_CONFIG_PATHS);
  const deletedConfig = options.deleteConfig ? deleteStoredConfig(USER_CONFIG_PATHS) : false;

  process.stdout.write(
    [
      uninstallResult.removed
        ? `Removed managed block from ${USER_CONFIG_PATHS.agentsPath}`
        : `No managed block found in ${USER_CONFIG_PATHS.agentsPath}`,
      options.deleteConfig
        ? deletedConfig
          ? `Deleted config ${USER_CONFIG_PATHS.configPath}`
          : `No config file found at ${USER_CONFIG_PATHS.configPath}`
        : `Kept config ${USER_CONFIG_PATHS.configPath}`,
    ].join("\n") + "\n",
  );
}

async function handleDoctor(argv) {
  const options = parseDoctorArgs(argv);
  if (options.help) {
    process.stdout.write(
      `Usage: ${CLI_NAME} doctor [options]

Options:
  --send-test
  -h, --help
`,
    );
    return;
  }

  const checks = [];
  const stored = readStoredConfig(USER_CONFIG_PATHS);
  checks.push({
    ok: stored.exists,
    label: "stored config",
    details: stored.exists ? stored.path : `missing: ${stored.path}`,
  });

  const agentsInstalled = (() => {
    try {
      return fs.existsSync(USER_CONFIG_PATHS.agentsPath)
        ? isManagedAgentsBlockInstalled(fs.readFileSync(USER_CONFIG_PATHS.agentsPath, "utf8"))
        : false;
    } catch {
      return false;
    }
  })();

  checks.push({
    ok: agentsInstalled,
    label: "managed AGENTS.md block",
    details: USER_CONFIG_PATHS.agentsPath,
  });

  let config;
  try {
    config = resolveTelegramConfig({
      defaults: stored.config,
    });
    checks.push({
      ok: true,
      label: "resolved telegram config",
      details: `chat ${config.chatId}`,
    });
  } catch (error) {
    checks.push({
      ok: false,
      label: "resolved telegram config",
      details: error instanceof Error ? error.message : String(error),
    });
  }

  if (config) {
    try {
      const profile = await callTelegramApi({
        token: config.token,
        apiBase: config.apiBase,
        method: "getMe",
      });
      checks.push({
        ok: true,
        label: "telegram bot token",
        details: `@${profile.username || profile.first_name || "bot"}`,
      });
    } catch (error) {
      checks.push({
        ok: false,
        label: "telegram bot token",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const chat = await callTelegramApi({
        token: config.token,
        apiBase: config.apiBase,
        method: "getChat",
        body: {
          chat_id: config.chatId,
        },
      });
      checks.push({
        ok: true,
        label: "telegram chat id",
        details: `${chat.type}${chat.username ? ` @${chat.username}` : ""}`,
      });
    } catch (error) {
      checks.push({
        ok: false,
        label: "telegram chat id",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    if (options.sendTest) {
      try {
        await sendTelegramMessage({
          ...config,
          text: renderNotificationText({
            status: "success",
            title: "codex-telegram-notifier doctor",
            message: "Doctor test message delivered successfully.",
          }),
        });
        checks.push({
          ok: true,
          label: "test message",
          details: "sent",
        });
      } catch (error) {
        checks.push({
          ok: false,
          label: "test message",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  for (const check of checks) {
    process.stdout.write(`${check.ok ? "PASS" : "FAIL"} ${check.label}: ${check.details}\n`);
  }

  if (checks.some((check) => !check.ok)) {
    process.exit(1);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case undefined:
    case "-h":
    case "--help": {
      process.stdout.write(renderHelp());
      return;
    }
    case "send": {
      await handleSend(rest);
      return;
    }
    case "install": {
      await handleInstall(rest);
      return;
    }
    case "print-instructions": {
      await handlePrintInstructions(rest);
      return;
    }
    case "uninstall": {
      await handleUninstall(rest);
      return;
    }
    case "doctor": {
      await handleDoctor(rest);
      return;
    }
    case "wrap": {
      await handleWrap(rest);
      return;
    }
    case "serve": {
      await handleServe(rest);
      return;
    }
    default: {
      throw new Error(`Unknown command "${command}".`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
