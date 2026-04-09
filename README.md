# codex-telegram-notifier

Standalone Telegram notifications for Codex tasks and automations.

This project is intentionally separate from any existing repo. It uses the Telegram Bot API directly and has no runtime dependencies beyond Node 20+.

## What it gives you

- `send`: send a Telegram message directly
- `wrap`: run any command and notify on success or failure
- `serve`: expose a tiny authenticated HTTP endpoint that Codex or another tool can `POST` to

## Setup

1. Create a bot with `@BotFather`.
2. Get your Telegram chat id or channel target.
3. Copy `.env.example` values into your shell:

```bash
export TELEGRAM_BOT_TOKEN="123456:replace-me"
export TELEGRAM_CHAT_ID="123456789"
export TELEGRAM_THREAD_ID=""
export NOTIFIER_AUTH_TOKEN="replace-me"
```

The CLI also auto-loads `.env` and `.env.local` from the project root, so you can keep local credentials in the project directory without exporting them in every shell.

## Commands

### 1. Send a message directly

```bash
node src/index.mjs send \
  --status success \
  --title "Codex task finished" \
  --message "Implemented the feature."
```

You can also feed JSON from stdin:

```bash
printf '%s\n' '{
  "status": "failure",
  "title": "Nightly automation failed",
  "message": "Tests failed",
  "details": "See CI logs"
}' | node src/index.mjs send --json-stdin
```

### 2. Wrap another command

This is the fastest path if you want Codex to execute one thing and always notify you afterward.

```bash
node src/index.mjs wrap \
  --title "Nightly build" \
  --success-message "Build passed." \
  --failure-message "Build failed." \
  -- npm test
```

If you only want alerts on failures:

```bash
node src/index.mjs wrap --title "Nightly build" --only-failures -- npm test
```

### 3. Run an HTTP endpoint

If you want Codex to "hit" something instead of executing the notifier directly:

```bash
node src/index.mjs serve
```

Default endpoint:

- host: `127.0.0.1`
- port: `8787`
- path: `/notify`

Authenticated request example:

```bash
curl -X POST http://127.0.0.1:8787/notify \
  -H "Authorization: Bearer $NOTIFIER_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "success",
    "title": "Codex task finished",
    "message": "Implemented the notifier project."
  }'
```

## How to use this with Codex

Tell Codex to run one of these at the end of the task.

### Direct execution pattern

```text
At the end of this task, run:

node /tmp/codex-telegram-notifier/src/index.mjs send \
  --status success \
  --title "Codex task finished" \
  --message "<one-line summary>"

If the task fails, run the same command with --status failure.
```

### HTTP pattern

```text
At the end of this task, POST to http://127.0.0.1:8787/notify with the bearer token and a JSON payload containing status, title, and message.
```

### Wrapper pattern

If you already know the exact command to run, tell Codex to run the wrapper instead of the raw command:

```bash
node /tmp/codex-telegram-notifier/src/index.mjs wrap \
  --title "Long task" \
  -- <your command here>
```

## Test

```bash
npm test
```
