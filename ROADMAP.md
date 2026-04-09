# Roadmap

`codex-telegram-notifier` should win a narrow category: the best way to get useful Telegram notifications from Codex.

This package should not expand into a generic bot platform, multi-channel notifier, or hosted product until the core loop is excellent.

## Product thesis

The job to be done is simple:

- tell me when Codex finished
- tell me whether it succeeded, failed, or needs review
- tell me the actual result, not just "done"
- work across projects with near-zero setup friction

The roadmap is optimized around three product priorities:

- setup speed
- message quality
- delivery reliability

## Current baseline

Current release line: `0.2.4`

Already shipped in the repo today:

- global CLI with `install`, `uninstall`, `doctor`, `send`, `wrap`, and `serve`
- managed `~/.codex/AGENTS.md` install flow
- direct send plus `--json-stdin` for structured payload input
- user docs for first-run setup, Codex integration, Telegram credentials, and npm publishing
- package metadata, `LICENSE`, and `.gitignore` coverage for packed tarballs such as `*.tgz`

Not shipped yet:

- generated Codex instruction blocks via a dedicated command
- configurable install modes such as `basic`, `rich`, and `automation`
- structured result-file input such as `send --result-file`
- result presets for tests, builds, deploys, and reviews
- retry and backoff for Telegram delivery
- service install and health management for unattended runs

## Scope guardrails

Do now:

- make install boring and predictable
- make result messages useful at a glance
- make unattended delivery reliable

Do not do yet:

- Slack or Discord adapters
- dashboards or hosted SaaS
- speculative architecture around Codex hooks that do not exist yet

If Codex later exposes native post-task hooks, add that as a new integration mode without breaking the current instruction-based flow.

## Version milestones

### `0.2.x` Stabilize the package

Objective: a user can go from `npm install -g codex-telegram-notifier` to the first useful notification in under 5 minutes.

Deliverables:

- tighten first-run docs around direct messages, groups, channels, topic IDs, and token rotation
- improve common error guidance in `doctor` and onboarding docs
- keep install, uninstall, and doctor as the primary onboarding path
- keep package metadata, release workflow, and semver discipline explicit in docs and release practice

Exit criteria:

- install is predictable
- doctor failures point to an actionable fix
- users rarely need to edit `~/.codex/AGENTS.md` manually after install

### `0.3.0` Codex integration modes

Objective: Codex users should not have to handcraft notification instructions every time.

Deliverables:

- add `print-instructions` to emit recommended Codex instruction blocks
- add `install --mode basic|rich|automation`
- make the managed `AGENTS.md` block configurable by install mode
- define install mode behavior clearly in CLI help and docs

Mode definitions:

| Mode | Expected output |
| --- | --- |
| `basic` | success and failure only |
| `rich` | summary plus meaningful details |
| `automation` | counts, report paths, blockers, and next action |

Exit criteria:

- a user can choose notification style during install
- Codex instructions become copy-paste simple
- richer messages no longer require manual `AGENTS.md` editing

### `0.4.0` Result-oriented payloads

Objective: messages should answer "what happened?" in one glance.

Deliverables:

- standardize a result schema across CLI and HTTP payloads
- support these fields consistently: `status`, `title`, `message`, `details`, `command`, `cwd`, `exitCode`, `finishedAt`, `artifacts`, `urls`, and `nextAction`
- add `send --result-file <path>`
- add message presets for test results, build results, deploy results, automation summaries, and review results
- trim long details cleanly so Telegram messages stay readable

Exit criteria:

- the average message includes enough context that the terminal does not need to be opened immediately
- CLI input and HTTP input render the same result shape
- long outputs degrade gracefully instead of becoming message spam

### `0.5.0` Unattended automation reliability

Objective: overnight and background runs should deliver reliably with minimal operator attention.

Deliverables:

- add retry and backoff for Telegram API failures
- add optional local delivery logs
- add `serve --install-service` for `launchd` on macOS
- add service health checks to `doctor`
- add local endpoint auth-token rotation or regeneration support
- define Linux `systemd` support as the next step after the macOS service path is stable

Exit criteria:

- background delivery failures are visible and diagnosable
- automations can run unattended without silent drop risk
- doctor can confirm both Codex wiring and service health

### `1.0.0` Harden the Codex experience

Objective: Codex-specific usage should feel intentional, stable, and well-documented.

Deliverables:

- treat Codex integration as a first-class surface in CLI help and docs
- add polished examples for end-of-task summaries, blockers, QA results, PR review outcomes, deployment notifications, and artifact or report links
- keep the instruction-based workflow stable while allowing a future native-hook mode when Codex supports it

Exit criteria:

- the public CLI is stable enough to document as the recommended Codex-to-Telegram path
- docs cover both interactive use and unattended automation use
- future Codex-native integration can be added without a breaking redesign

## Prioritized backlog

### P0: next items

- `print-instructions` command
- `install --mode basic|rich|automation`
- configurable managed `AGENTS.md` block output
- `send --result-file`
- shared result schema across CLI and HTTP
- cleaner `doctor` output for AGENTS block status and actionable fixes

### P1: immediately after structured results

- result presets for test, build, deploy, automation, and review outcomes
- output trimming rules for long details
- Telegram retry and backoff
- optional local delivery logs

### P2: reliability and polish

- `serve --install-service` for macOS `launchd`
- service health checks in `doctor`
- auth-token rotation or regeneration for the local HTTP endpoint
- Linux `systemd` support after the macOS path is stable
- expanded Codex-first examples in help text and docs

### Already addressed

- `LICENSE`
- package metadata and semver baseline
- publishing and trusted publishing documentation
- `*.tgz` ignored in `.gitignore`

## Suggested release sequence

- `0.2.x`: finish stabilization and onboarding cleanup
- `0.3.0`: ship install modes and generated Codex instructions
- `0.4.0`: ship structured result payloads and result-file support
- `0.5.0`: ship retry, logs, service install, and service health
- `1.0.0`: freeze a stable Codex-first public CLI and documentation set

## Success metrics

Track these informally first, then formalize them once usage grows:

- time to first successful notification
- percentage of installs that require manual `AGENTS.md` edits afterward
- percentage of `doctor` failures that end with an actionable fix
- percentage of messages that contain enough outcome detail to avoid opening the terminal immediately
- delivery reliability for repeated background or overnight runs
