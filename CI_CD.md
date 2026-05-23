# CI/CD

This repo is built around GitHub Actions and local pnpm checks.

## Local checks

```bash
pnpm lint
pnpm typecheck
pnpm typecheck:native
pnpm test
pnpm build
pnpm electron:build
```

## What CI should enforce

- formatting and linting
- TypeScript type safety
- unit tests
- desktop build smoke checks

## Release flow

Releases are triggered by Git tags, not by release branches.

The release workflow runs when a tag matching `v*` is pushed:

```text
v0.1.0
v1.0.0
v1.2.3-beta.1
```

Recommended release steps:

1. Make sure `main` is green and contains the code to release.
2. Create a release pull request that updates `package.json` version.
3. Merge the release pull request into `main`.
4. Pull the latest `main` locally.
5. Create and push an annotated tag.

Example:

```bash
git switch main
git pull
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

After the tag is pushed, GitHub Actions will:

1. run quality checks
2. run tests
3. build Electron artifacts
4. create a draft GitHub Release

Review the draft release on GitHub, check the generated notes and artifacts, then publish it manually.

Do not create `v0.1.0` as a branch. Version-like names are reserved for tags.

## Notes

- The docs site in `docs/` is its own workspace package.
- Keep macOS notarization notes separate if release signing is added later.
