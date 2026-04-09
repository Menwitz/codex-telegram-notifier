import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadProjectEnv,
  parseBooleanLike,
  parseDoctorArgs,
  parseDotenv,
  parseInstallArgs,
  parsePrintInstructionsArgs,
  parseServeArgs,
  parseSendArgs,
  parseUninstallArgs,
  parseWrapArgs,
  normalizeNotificationResult,
  readJsonFile,
  renderHelp,
  renderNotificationText,
  resolveTelegramConfig,
  requireBearerToken,
  splitDoubleDash,
  validateStatus,
} from "../src/lib.mjs";

const CLI_ENTRY = fileURLToPath(new URL("../src/index.mjs", import.meta.url));

test("splitDoubleDash separates wrapper command args", () => {
  assert.deepEqual(splitDoubleDash(["--title", "Job", "--", "npm", "test"]), {
    before: ["--title", "Job"],
    after: ["npm", "test"],
  });
});

test("validateStatus rejects unknown values", () => {
  assert.equal(validateStatus("success"), "success");
  assert.throws(() => validateStatus("done"), /Invalid status/);
});

test("parseBooleanLike accepts common env values", () => {
  assert.equal(parseBooleanLike("true", "FIELD"), true);
  assert.equal(parseBooleanLike("0", "FIELD"), false);
});

test("parseDotenv reads basic key value pairs", () => {
  assert.deepEqual(
    parseDotenv(
      [
        "# comment",
        "TELEGRAM_BOT_TOKEN=abc",
        "TELEGRAM_CHAT_ID=\"123\"",
        "TELEGRAM_THREAD_ID='42'",
      ].join("\n"),
    ),
    {
      TELEGRAM_BOT_TOKEN: "abc",
      TELEGRAM_CHAT_ID: "123",
      TELEGRAM_THREAD_ID: "42",
    },
  );
});

test("loadProjectEnv applies .env values without overriding existing env", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-telegram-env-"));
  fs.writeFileSync(
    path.join(tempDir, ".env"),
    "TELEGRAM_CHAT_ID=123\nTELEGRAM_BOT_TOKEN=file-token\n",
    "utf8",
  );
  fs.writeFileSync(path.join(tempDir, ".env.local"), "TELEGRAM_THREAD_ID=7\n", "utf8");

  const env = {
    TELEGRAM_BOT_TOKEN: "shell-token",
  };
  loadProjectEnv(tempDir, env);

  assert.deepEqual(env, {
    TELEGRAM_BOT_TOKEN: "shell-token",
    TELEGRAM_CHAT_ID: "123",
    TELEGRAM_THREAD_ID: "7",
  });
});

test("parseSendArgs reads standard flags", () => {
  assert.deepEqual(
    parseSendArgs([
      "--title",
      "Task done",
      "--message",
      "Completed.",
      "--status",
      "success",
      "--result-file",
      "result.json",
      "--chat-id",
      "123",
      "--thread-id",
      "42",
      "--json-stdin",
      "--silent",
    ]),
    {
      help: false,
      token: undefined,
      chatId: "123",
      threadId: "42",
      apiBase: undefined,
      status: "success",
      title: "Task done",
      message: "Completed.",
      details: undefined,
      resultFile: "result.json",
      disableNotification: true,
      jsonStdin: true,
    },
  );
});

test("parseWrapArgs keeps wrapped command after double dash", () => {
  assert.deepEqual(
    parseWrapArgs([
      "--title",
      "Nightly",
      "--only-failures",
      "--",
      "node",
      "job.mjs",
      "--fast",
    ]),
    {
      help: false,
      token: undefined,
      chatId: undefined,
      threadId: undefined,
      apiBase: undefined,
      title: "Nightly",
      message: undefined,
      details: undefined,
      successMessage: undefined,
      failureMessage: undefined,
      onlyFailures: true,
      disableNotification: false,
      commandArgs: ["node", "job.mjs", "--fast"],
    },
  );
});

test("parseServeArgs applies env defaults", () => {
  const previousEnv = {
    NOTIFIER_PORT: process.env.NOTIFIER_PORT,
    NOTIFIER_LISTEN_HOST: process.env.NOTIFIER_LISTEN_HOST,
    NOTIFIER_PATH: process.env.NOTIFIER_PATH,
    NOTIFIER_AUTH_TOKEN: process.env.NOTIFIER_AUTH_TOKEN,
  };
  process.env.NOTIFIER_PORT = "9999";
  process.env.NOTIFIER_LISTEN_HOST = "0.0.0.0";
  process.env.NOTIFIER_PATH = "telegram";
  process.env.NOTIFIER_AUTH_TOKEN = "secret";

  try {
    assert.deepEqual(parseServeArgs([]), {
      help: false,
      host: "0.0.0.0",
      port: 9999,
      path: "/telegram",
      token: undefined,
      chatId: undefined,
      threadId: undefined,
      apiBase: undefined,
      authToken: "secret",
      disableNotification: false,
    });
  } finally {
    process.env.NOTIFIER_PORT = previousEnv.NOTIFIER_PORT;
    process.env.NOTIFIER_LISTEN_HOST = previousEnv.NOTIFIER_LISTEN_HOST;
    process.env.NOTIFIER_PATH = previousEnv.NOTIFIER_PATH;
    process.env.NOTIFIER_AUTH_TOKEN = previousEnv.NOTIFIER_AUTH_TOKEN;
  }
});

test("parseServeArgs falls back to stored auth token", () => {
  assert.deepEqual(
    parseServeArgs([], {}, {
      notifierAuthToken: "stored-secret",
    }),
    {
      help: false,
      host: "127.0.0.1",
      port: 8787,
      path: "/notify",
      token: undefined,
      chatId: undefined,
      threadId: undefined,
      apiBase: undefined,
      authToken: "stored-secret",
      disableNotification: false,
    },
  );
});

test("parseInstallArgs reads install flags", () => {
  assert.deepEqual(
    parseInstallArgs([
      "--chat-id",
      "123",
      "--thread-id",
      "42",
      "--auth-token",
      "secret",
      "--mode",
      "automation",
      "--skip-agents",
      "--silent",
    ]),
    {
      help: false,
      token: undefined,
      chatId: "123",
      threadId: "42",
      apiBase: undefined,
      authToken: "secret",
      mode: "automation",
      disableNotification: true,
      skipAgents: true,
    },
  );
});

test("parsePrintInstructionsArgs reads mode flags", () => {
  assert.deepEqual(parsePrintInstructionsArgs(["--mode", "rich"]), {
    help: false,
    mode: "rich",
  });
});

test("parseUninstallArgs and parseDoctorArgs read boolean flags", () => {
  assert.deepEqual(parseUninstallArgs(["--delete-config"]), {
    help: false,
    deleteConfig: true,
  });
  assert.deepEqual(parseDoctorArgs(["--send-test"]), {
    help: false,
    sendTest: true,
  });
});

test("resolveTelegramConfig uses stored defaults when env is empty", () => {
  assert.deepEqual(
    resolveTelegramConfig(
      {
        defaults: {
          telegramBotToken: "stored-token",
          telegramChatId: "stored-chat",
          telegramThreadId: "7",
          telegramApiBase: "https://example.test/",
          disableNotification: true,
        },
      },
      {},
    ),
    {
      token: "stored-token",
      chatId: "stored-chat",
      threadId: "7",
      apiBase: "https://example.test",
      disableNotification: true,
    },
  );
});

test("normalizeNotificationResult standardizes structured result fields", () => {
  assert.deepEqual(
    normalizeNotificationResult({
      status: "warning",
      title: "Review needed",
      message: "Nightly job finished.",
      artifacts: {
        report: "/tmp/report.html",
      },
      urls: [
        {
          label: "preview",
          url: "https://example.test/build/123",
        },
      ],
      next_action: "Inspect the failed auth flow.",
      exitCode: "1",
    }),
    {
      status: "warning",
      title: "Review needed",
      message: "Nightly job finished.",
      details: undefined,
      command: undefined,
      cwd: undefined,
      exitCode: 1,
      finishedAt: undefined,
      artifacts: ["report: /tmp/report.html"],
      urls: ["preview: https://example.test/build/123"],
      nextAction: "Inspect the failed auth flow.",
    },
  );
});

test("renderNotificationText builds readable telegram text", () => {
  assert.equal(
    renderNotificationText({
      status: "failure",
      title: "Nightly failed",
      message: "The job exited non-zero.",
      artifacts: {
        report: "/tmp/report.txt",
      },
      urls: ["https://example.test/job/123"],
      nextAction: "Inspect the failure before rerunning.",
      command: "npm test",
      cwd: "/workspace",
      exitCode: 1,
      finishedAt: "2026-04-09T12:00:00.000Z",
    }),
    [
      "❌ Nightly failed",
      "The job exited non-zero.",
      "artifacts:\n- report: /tmp/report.txt",
      "urls:\n- https://example.test/job/123",
      "next action: Inspect the failure before rerunning.",
      "command: npm test",
      "cwd: /workspace",
      "exit: 1",
      "finished: 2026-04-09T12:00:00.000Z",
    ].join("\n\n"),
  );
});

test("renderNotificationText trims oversized sections cleanly", () => {
  const longLines = Array.from({ length: 15 }, (_, index) => `line ${index + 1}`);
  const manyArtifacts = Array.from({ length: 8 }, (_, index) => `artifact ${index + 1}`);

  const text = renderNotificationText({
    status: "success",
    title: "Long report",
    details: longLines.join("\n"),
    artifacts: manyArtifacts,
  });

  assert.match(text, /line 12/);
  assert.match(text, /\.\.\. \(3 more lines\)/);
  assert.match(text, /artifact 6/);
  assert.match(text, /\.\.\. \(2 more\)/);
});

test("readJsonFile loads JSON payloads from disk", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-telegram-result-file-"));
  const filePath = path.join(tempDir, "result.json");
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      status: "success",
      title: "Loaded from file",
      artifacts: {
        report: "/tmp/report.html",
      },
    }),
    "utf8",
  );

  assert.deepEqual(readJsonFile(filePath), {
    status: "success",
    title: "Loaded from file",
    artifacts: {
      report: "/tmp/report.html",
    },
  });
});

test("requireBearerToken accepts bearer or x-notify-token", () => {
  assert.equal(
    requireBearerToken({ authorization: "Bearer secret" }, "secret"),
    true,
  );
  assert.equal(
    requireBearerToken({ "x-notify-token": "secret" }, "secret"),
    true,
  );
  assert.equal(
    requireBearerToken({ authorization: "Bearer wrong" }, "secret"),
    false,
  );
});

test("renderHelp includes print-instructions", () => {
  assert.match(renderHelp(), /print-instructions/);
});

test("print-instructions emits the selected instruction template", () => {
  const output = execFileSync(
    process.execPath,
    [CLI_ENTRY, "print-instructions", "--mode", "automation"],
    {
      cwd: path.dirname(CLI_ENTRY),
      encoding: "utf8",
    },
  );

  assert.match(output, /After completing a task or automation, always run/);
  assert.match(output, /For unattended runs, prefer including:/);
  assert.doesNotMatch(output, /codex-telegram-notifier:start/);
});
