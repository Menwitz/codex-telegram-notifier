# Using with Codex

`codex-telegram-notifier` works best when Codex treats Telegram as the final reporting step for a task, command, or automation.

The project supports three integration patterns:

1. `send` for explicit end-of-task summaries
2. `wrap` for known commands that should always report their result
3. `serve` for local HTTP callbacks from Codex or another scheduler

It also supports three instruction profiles for Codex-facing guidance:

- `basic` for simple success and failure notifications
- `rich` for concise summaries plus useful result details
- `automation` for unattended runs that should report counts, artifacts, blockers, and next actions

## 1. Let Codex send a final task summary

The `install` command already adds a managed block to `~/.codex/AGENTS.md`, and you can now choose the style during install.

Examples:

```bash
codex-telegram-notifier install --mode basic
codex-telegram-notifier install --mode rich
codex-telegram-notifier install --mode automation
```

`basic` keeps the existing low-friction success or failure behavior. `rich` is the best default when you want Codex to include a summary and meaningful details. `automation` is the best fit for recurring or unattended runs.

If you want a copy-pasteable template without changing the managed install, print one directly:

```bash
codex-telegram-notifier print-instructions
codex-telegram-notifier print-instructions --mode automation
```

The default `print-instructions` output is the recommended `rich` template unless you already have a stored mode from install.

Use instructions like this:

```text
At the end of the task, send a Telegram notification with codex-telegram-notifier.

If the task succeeds:
- use status success
- summarize the completed work in --message
- include result details in --details, such as counts, changed files, URLs, or report paths

If the task fails or is blocked:
- use status failure
- explain the blocker in --message
- include the most useful next step in --details
```

## 2. Example task notifications

### Success with result details

```bash
codex-telegram-notifier send \
  --status success \
  --title "Codex task finished" \
  --message "Updated the npm publish workflow." \
  --details $'Results:\n- Added trusted publishing workflow\n- Added MIT license\n- Pushed tag v0.2.3'
```

### Failure with a blocker and next action

```bash
codex-telegram-notifier send \
  --status failure \
  --title "Codex task blocked" \
  --message "The package was prepared, but npm trusted publishing is not configured yet." \
  --details $'Next action:\n- Open npm package settings\n- Add trusted publisher for publish.yml'
```

### Warning when work completes but still needs review

```bash
codex-telegram-notifier send \
  --status warning \
  --title "Codex task needs review" \
  --message "The refactor completed, but two failing tests remain." \
  --details $'Results:\n- Passing: 128\n- Failing: 2\n- Report: /tmp/vitest-report.txt'
```

## 3. Send structured results over JSON

When a task already produces structured output, piping JSON into `send --json-stdin` is usually the cleanest option.

```bash
printf '%s\n' '{
  "status": "success",
  "title": "Nightly audit finished",
  "message": "Dependency audit completed.",
  "details": "Critical: 0\nHigh: 1\nReport: /tmp/audit.json"
}' | codex-telegram-notifier send --json-stdin
```

## 4. Wrap a command that should always report

Use `wrap` when the task is just one command and you want the notifier to handle success, failure, command text, working directory, exit code, and finish time automatically.

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

## 5. Use it in Codex automations

For recurring automations, put the reporting requirement directly into the automation prompt.

Example:

```text
Run the nightly QA suite.

At the end:
- send a Telegram notification with the overall status
- include passed and failed counts
- include the main report path
- say whether follow-up is needed

Use codex-telegram-notifier send for the final notification.
```

### Example automation result message

```bash
codex-telegram-notifier send \
  --status warning \
  --title "Nightly QA needs review" \
  --message "The automation completed, but two failures need attention." \
  --details $'Results:\n- Passed: 128\n- Failed: 2\n- Report: /tmp/qa-report.html\n- Follow-up: inspect browser auth flow'
```

## 6. Use a stable local HTTP endpoint

If you prefer to have Codex or another runner call one fixed URL:

```bash
codex-telegram-notifier serve
```

Then post a payload like this:

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
    "finishedAt": "2026-04-09T12:34:56.000Z"
  }'
```

Useful fields for result-rich HTTP payloads:

- `status`
- `title`
- `message`
- `details`
- `command`
- `cwd`
- `exitCode`
- `finishedAt`
- `chatId`
- `threadId`

## 7. What makes a good Telegram message

The most useful Codex notifications usually contain:

- a clear title that says what finished
- a short outcome sentence
- the result details that matter, such as counts, paths, URLs, or next actions
- a blocker or follow-up when the run was not clean

Avoid sending only "done" or "failed" when Codex can include the actual outcome.
