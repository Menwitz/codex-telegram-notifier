# codex-telegram-notifier

Standalone Telegram notifications for Codex tasks and automations.

This project is intentionally separate from your application repos. It uses the Telegram Bot API directly and can be installed as a global CLI so Codex can call one stable command from any project.

## What it gives you

- `install`: save notifier config and add a managed notification rule to `~/.codex/AGENTS.md`
- `uninstall`: remove the managed Codex rule and optionally delete stored config
- `doctor`: verify stored config, Telegram connectivity, and Codex wiring
- `send`: send a Telegram message directly
- `wrap`: run any command and notify on success or failure
- `serve`: expose a tiny authenticated HTTP endpoint that Codex or another tool can `POST` to

## Global install

Install the CLI globally:

```bash
npm install -g codex-telegram-notifier
```

Before you run `install`, collect the Telegram values it needs:

1. Create a bot with `@BotFather`.
   Run `/newbot`, follow the prompts, and copy the API token from BotFather's reply.
   Use that value as `TELEGRAM_BOT_TOKEN`.
2. Get the target chat ID.
   Send a message to the bot from the chat, group, or channel you want to notify, then run:

   ```bash
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"
   ```

   Copy `message.chat.id` from the JSON response and use it as `TELEGRAM_CHAT_ID`.
   Keep the minus sign for groups and supergroups. Public channels can also use `@channelusername`.
3. Optional: get the topic/thread ID.
   If you send notifications into a Telegram topic, send a message inside that topic and copy `message.message_thread_id` from the same `getUpdates` response.
   Use that value as `TELEGRAM_THREAD_ID`.

Then save your Telegram settings and install the managed Codex rule:

```bash
codex-telegram-notifier install \
  --token "123456:replace-me" \
  --chat-id "123456789"
```

Optional flags:

- `--thread-id` for Telegram forum topics
- `--auth-token` to persist an auth token for `serve`
- `--silent` to disable Telegram push notifications
- `--skip-agents` if you only want stored config and do not want the Codex rule installed yet

The install command writes user-level config to:

- macOS/Linux: `~/.config/codex-telegram-notifier/config.json`
- Windows: `%APPDATA%/codex-telegram-notifier/config.json`

It also adds a managed block to `~/.codex/AGENTS.md` so Codex knows to call the notifier after finishing work.

For the longer version with direct-message, group, channel, and topic examples, see [docs/telegram-credentials.md](./docs/telegram-credentials.md).

## Health check

Validate the setup:

```bash
codex-telegram-notifier doctor
```

Send a real test message as part of the doctor run:

```bash
codex-telegram-notifier doctor --send-test
```

## Remove the integration

Remove the managed Codex rule but keep your stored config:

```bash
codex-telegram-notifier uninstall
```

Remove both the rule and the stored config:

```bash
codex-telegram-notifier uninstall --delete-config
```

## Send a message directly

```bash
codex-telegram-notifier send \
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
}' | codex-telegram-notifier send --json-stdin
```

## Wrap another command

This is the fastest path if you already know the command you want to run and always want a Telegram result afterward.

```bash
codex-telegram-notifier wrap \
  --title "Nightly build" \
  --success-message "Build passed." \
  --failure-message "Build failed." \
  -- npm test
```

If you only want alerts on failures:

```bash
codex-telegram-notifier wrap --title "Nightly build" --only-failures -- npm test
```

## Run an HTTP endpoint

If you want Codex to hit a local endpoint instead of executing the notifier directly:

```bash
codex-telegram-notifier serve
```

Default endpoint:

- host: `127.0.0.1`
- port: `8787`
- path: `/notify`

Authenticated request example:

```bash
curl -X POST http://127.0.0.1:8787/notify \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "success",
    "title": "Codex task finished",
    "message": "Implemented the notifier project."
  }'
```

## Source-tree development

If you are working on the project itself, the CLI still auto-loads `.env` and `.env.local` from the project root.

```bash
export TELEGRAM_BOT_TOKEN="123456:replace-me"
export TELEGRAM_CHAT_ID="123456789"
node src/index.mjs doctor
```

## Test

```bash
npm test
```

## Publishing

Release guidance for the npm package lives in [docs/publishing.md](./docs/publishing.md).
