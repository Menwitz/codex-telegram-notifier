#!/usr/bin/env node

import http from "node:http";
import {
  parseJsonInput,
  parseSendArgs,
  parseServeArgs,
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

async function handleSend(argv) {
  const options = parseSendArgs(argv);
  if (options.help) {
    process.stdout.write(
      `Usage: node src/index.mjs send [options]

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

  const config = resolveTelegramConfig(
    {
      token: options.token ?? stdinPayload.token,
      chatId: options.chatId ?? stdinPayload.chatId ?? stdinPayload.chat_id,
      threadId: options.threadId ?? stdinPayload.threadId ?? stdinPayload.thread_id,
      apiBase: options.apiBase ?? stdinPayload.apiBase,
      disableNotification:
        options.disableNotification === true
          ? true
          : stdinPayload.disableNotification ?? stdinPayload.silent,
    },
    process.env,
  );

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
      `Usage: node src/index.mjs wrap [options] -- <command> [args...]

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

  const config = resolveTelegramConfig(
    {
      token: options.token,
      chatId: options.chatId,
      threadId: options.threadId,
      apiBase: options.apiBase,
      disableNotification: options.disableNotification,
    },
    process.env,
  );

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
  const options = parseServeArgs(argv);
  if (options.help) {
    process.stdout.write(
      `Usage: node src/index.mjs serve [options]

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

  const config = resolveTelegramConfig(
    {
      token: options.token,
      chatId: options.chatId,
      threadId: options.threadId,
      apiBase: options.apiBase,
      disableNotification: options.disableNotification,
    },
    process.env,
  );

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
