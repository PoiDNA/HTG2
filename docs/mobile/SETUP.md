# Mobile setup — follow-ups NOT done by this PR

This PR adds `apps/mobile/` and `packages/shared/` scaffolding. The following are intentionally **deferred** to separate PRs to avoid touching hot-zones silently:

## 1. Root `package.json` — npm workspaces

Per [CLAUDE.md](../../CLAUDE.md): no silent `package.json` updates. To make the monorepo resolve `@htg/shared` at install time, a separate PR must add:

```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

...to the **root** `package.json`, as a dedicated commit with `package.json` + `package-lock.json` only. Until then, install inside `apps/mobile` directly:

```bash
cd apps/mobile && npm install
```

Metro's `watchFolders` in [metro.config.js](../../apps/mobile/metro.config.js) handles symlink-free resolution for the shared package via the TS path alias.

## 2. CI

No mobile CI in this PR. Follow-up should add a GitHub Action running `tsc --noEmit` in `apps/mobile` and `packages/shared` on PRs that touch those paths.

## 3. CODEOWNERS

Mobile paths not yet in [CODEOWNERS](../../CODEOWNERS). Assign a reviewer before the first production build.

## 4. Assets

Placeholder paths in `app.config.ts` reference files not yet in repo. See [apps/mobile/assets/README.md](../../apps/mobile/assets/README.md).

## 5. Backend mobile endpoints

None of the `/api/mobile/*` routes referenced in [api-contract.md](./api-contract.md) exist yet. [MOB-SPIKE-04](https://github.com/PoiDNA/HTG2/issues/558) audits the gap.
