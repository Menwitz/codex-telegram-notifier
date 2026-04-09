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

Run the local checks:

```bash
npm test
node src/index.mjs --help
npm pack --dry-run
```

## Cut a release

npm package versions are immutable. Every publish must use a new version.

Bump the package version without creating a git tag automatically:

```bash
npm version patch --no-git-tag-version
```

Commit the release:

```bash
git add package.json
git commit -m "build: release 0.2.3"
```

Create and push the matching tag:

```bash
git tag v0.2.3
git push origin main
git push origin v0.2.3
```

The GitHub Actions workflow in `.github/workflows/publish.yml` verifies that the git tag matches the package version, runs the test suite, checks the packed contents, and publishes the package to npm through trusted publishing.

If a publish fails in GitHub Actions, check these first:

- the package version is new and has never been published before
- the git tag matches `package.json`
- the trusted publisher is configured on npm for `Menwitz/codex-telegram-notifier`
- the workflow is running on a GitHub-hosted runner

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
