# Publishing to npm

This package is published as `codex-telegram-notifier`.

## Before you publish

1. Make sure `npm test` passes.
2. Verify the CLI entrypoint and packed contents:

```bash
node src/index.mjs --help
npm pack --dry-run
```

3. Log in to npm:

```bash
npm login
```

## Release a new version

npm package versions are immutable. If `0.2.0` is already on npm, you must publish `0.2.1` or higher.

Bump the package version:

```bash
npm version patch
```

Or, if you want to manage the git commit and tag yourself:

```bash
npm version patch --no-git-tag-version
```

Publish the package:

```bash
npm publish
```

## Verify the published package

Check the live version:

```bash
npm view codex-telegram-notifier version dist-tags --json
```

Test the installed CLI:

```bash
npm install -g codex-telegram-notifier
codex-telegram-notifier --help
```

## Release notes

When you prepare a release commit, include:

- the new package version in `package.json`
- any npm metadata updates such as `repository`, `homepage`, `bugs`, and `keywords`
- README or docs changes that affect the install or publish flow
