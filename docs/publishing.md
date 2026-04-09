# Publishing to npm

This package is published as `codex-telegram-notifier`.

## One-time setup

1. Publish the package manually at least once from your machine if npm does not already know about it.
2. In the npm package settings, configure a trusted publisher for this repository:
   - GitHub user or organization: `Menwitz`
   - Repository: `codex-telegram-notifier`
   - Workflow filename: `publish.yml`
3. After the trusted publisher is configured, npm releases should come from GitHub Actions instead of a long-lived npm token.
4. The publish workflow uses Node 24 and installs npm `11.5.1` explicitly because npm trusted publishing requires npm `11.5.1+`.

## Before a release

Run the release helper:

```bash
npm run release:prepare
```

That command runs the local checks used by the publish workflow:

- `npm test`
- `node src/index.mjs --help`
- `npm pack --dry-run`

It then prints the exact `git add`, `git commit`, `git tag`, and `git push` commands for the current `package.json` version.

## Next release example: `0.2.4`

If `0.2.3` is already published, the next release must be `0.2.4` or higher.

After the helper passes, run the printed commands. They should look like this for `0.2.4`:

```bash
git add package.json
git commit -m "build: release 0.2.4"
git tag v0.2.4
git push origin main
git push origin v0.2.4
```

The GitHub Actions workflow in `.github/workflows/publish.yml` verifies that the git tag matches the package version, runs the test suite, checks the packed contents, and publishes the package to npm through trusted publishing.

## If publish fails in GitHub Actions

Check these first:

- the package version is new and has never been published before
- the git tag matches `package.json`
- the trusted publisher is configured on npm for `Menwitz/codex-telegram-notifier`
- the workflow is running on a GitHub-hosted runner
- the job is using npm `11.5.1+`

## Verify the published package

Check the live version:

```bash
npm view codex-telegram-notifier version dist-tags --json
```

Test the public install path:

```bash
npm install -g codex-telegram-notifier
codex-telegram-notifier --help
```
