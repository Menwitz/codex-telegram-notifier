# codex-telegram-notifier

Standalone Telegram notifications for Codex tasks and automations.

This project is intentionally separate from your application repos. It uses the Telegram Bot API directly and can be installed as a global CLI so Codex can call one stable command from any project.

## What it gives you

- `install`: save notifier config and add a managed notification rule to `~/.codex/AGENTS.md`
- `print-instructions`: print reusable Codex instruction templates for the notification style you want
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
3. Optional: get the topic or thread ID.
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
- `--mode basic|rich|automation` to choose the managed Codex instruction style during install
- `--silent` to disable Telegram push notifications
- `--skip-agents` if you only want stored config and do not want the Codex rule installed yet

Install mode defaults to `basic` so the first-run behavior stays simple and backwards compatible.

The install command writes user-level config to:

- macOS/Linux: `~/.config/codex-telegram-notifier/config.json`
- Windows: `%APPDATA%/codex-telegram-notifier/config.json`

It also adds a managed block to `~/.codex/AGENTS.md` so Codex knows to call the notifier after finishing work.

For the longer version with direct-message, group, channel, and topic examples, see [docs/telegram-credentials.md](./docs/telegram-credentials.md).

## Roadmap

The product roadmap lives in [ROADMAP.md](./ROADMAP.md). It tracks the current baseline, version milestones, and the prioritized Codex-first backlog.

## Release docs

Public release instructions live in [docs/publishing.md](./docs/publishing.md).

## Health check

Validate the setup:

```bash
codex-telegram-notifier doctor
```

Send a real test message as part of the doctor run:

```bash
codex-telegram-notifier doctor --send-test
```

## How Codex should use it

The default `install` step adds a simple success or failure rule to `~/.codex/AGENTS.md`. That is enough to start getting notified, but you can get much better messages by asking Codex to send summaries, result counts, blockers, and artifact paths.

If you want the managed rule to be more opinionated from the start:

```bash
codex-telegram-notifier install \
  --token "123456:replace-me" \
  --chat-id "123456789" \
  --mode rich
```

The notifier is best used in one of these three ways:

1. `send` when Codex finishes a task and you want a custom summary
2. `wrap` when you already know the exact command that should run
3. `serve` when you want Codex or another process to hit one stable local endpoint

For a longer guide with copy-paste examples for Codex instructions and automations, see [docs/codex-integration.md](./docs/codex-integration.md).

## Print Codex instructions

Use `print-instructions` when you want a copy-pasteable instruction block without editing your managed install.

Recommended mode defaults:

- `basic`: minimal success or failure notifications
- `rich`: end-of-task summaries with meaningful details
- `automation`: result-heavy instructions for unattended runs

Print the richer recommended template:

```bash
codex-telegram-notifier print-instructions
```

Print a specific mode:

```bash
codex-telegram-notifier print-instructions --mode automation
```

### Example: end-of-task summary

Tell Codex to run this at the end of a task:

```bash
codex-telegram-notifier send \
  --status success \
  --title "Codex task finished" \
  --message "Added trusted npm publishing for codex-telegram-notifier." \
  --details $'Result:\n- Added GitHub Actions publish workflow\n- Added MIT license\n- Tagged release v0.2.3'
```

### Example: blocked or failure result

```bash
codex-telegram-notifier send \
  --status failure \
  --title "Codex task blocked" \
  --message "Publish workflow was added, but npm trusted publisher is not configured yet." \
  --details $'Next step:\n- Open npm package settings\n- Add GitHub Actions trusted publisher for publish.yml'
```

### Example: result payload over JSON stdin

This is useful when the result is structured and you want more than a one-line success or failure.

```bash
printf '%s\n' '{
  "status": "success",
  "title": "Nightly QA finished",
  "message": "Regression suite completed.",
  "details": "Passed: 128\nFailed: 2\nArtifacts: /tmp/qa-report.html"
}' | codex-telegram-notifier send --json-stdin
```

### Example: structured result from a file

When a task already writes JSON to disk, use `--result-file` instead of rebuilding the same payload as CLI flags.

```bash
codex-telegram-notifier send --result-file ./result.json
```

Useful structured result fields:

- `status`
- `title`
- `message`
- `details`
- `command`
- `cwd`
- `exitCode`
- `finishedAt`
- `artifacts`
- `urls`
- `nextAction`

`artifacts` and `urls` can be arrays or simple objects. Long sections are trimmed before sending so Telegram messages stay readable.

### Example: wrap an exact command

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

`wrap` automatically includes the command, working directory, exit code, and finish time in the Telegram message.

## Example Codex instructions

If you want to customize the default managed rule, tell Codex to use richer messages like this:

```text
At the end of the task, always run codex-telegram-notifier.

If the task succeeds:
- use status success
- summarize what changed
- include key results such as counts, artifact paths, URLs, or next actions in --details

If the task fails or is blocked:
- use status failure
- explain the blocker clearly
- include the most useful next step in --details
```

### Example automation prompt

This works well for recurring Codex automations:

```text
Run the nightly QA suite. When the run finishes, send a Telegram notification with:
- overall status
- total passed and failed counts
- the main report path
- whether follow-up is needed

Use codex-telegram-notifier send for the final message.
```

### Example automation result message

```bash
codex-telegram-notifier send \
  --status warning \
  --title "Nightly QA needs review" \
  --message "The automation completed, but two failures need attention." \
  --details $'Results:\n- Passed: 128\n- Failed: 2\n- Report: /tmp/qa-report.html\n- Follow-up: inspect browser auth flow'
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

Or read the payload from a file:

```bash
codex-telegram-notifier send --result-file ./nightly-result.json
```

Available statuses:

- `info`
- `success`
- `warning`
- `failure`

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

### Example HTTP payload with richer results

The server accepts the same richer fields that the CLI can render:

```bash
curl -X POST http://127.0.0.1:8787/notify \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "warning",
    "title": "Automation completed with findings",
    "message": "Dependency audit finished.",
    "details": "High: 1\nMedium: 3\nReport: /tmp/audit.json",
    "command": "npm audit --json",
    "cwd": "/workspace/project",
    "exitCode": 1,
    "finishedAt": "2026-04-09T12:34:56.000Z",
    "artifacts": {
      "report": "/tmp/audit.json"
    },
    "urls": [
      {
        "label": "dashboard",
        "url": "https://example.test/audits/123"
      }
    ],
    "nextAction": "Review the high-severity finding before merging."
  }'
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
