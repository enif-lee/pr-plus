# Phase 2 — Host open / refresh + IDB merge

## Goal

Progressive open stays; cache reinject and refresh merges use **set-authority**. Host publish remains the only path that paints domain into React props.

## Edit — host modules (SoT)

| Path | Changes |
|------|---------|
| `src/host/modules/open-modal-run.ts` | Replace `mergeCoreWithCache` cache reinject (`netHasPending` special cases) with set-authority / pure filter; hydrate IDB → DomainStore only; ensure progressive `applyCore` / sides unchanged in spirit |
| `src/host/modules/props-build.ts` | `paintRefreshCore` / thread reinject: same set-authority; do not re-seed dropped pending from `prevDetail` when settled empty |
| `src/host/modules/host-core-store.ts` | `applyCoreToStore` / `applySideToStore` / `applyThreadsFromMergedDetail` call sites; clear drop latch when network pending present |
| `src/host/modules/host-core-authority.ts` | Confirm `openGen` vs `metaRefreshGen` vs progress; document gates |
| `src/host/modules/side-fetch-kick.ts` | Ensure settle flags set only on success (align v4 settled authority) |
| `src/host/modules/side-fetch-progress.ts` | `progressAlive` independent of meta patch gen |
| `src/host/modules/side-fetch-cache-assets.ts` | IDB read/write only via domain projection helpers |
| `src/host/modules/detail-on-patch.ts` | Minimal: if patch brings VPR, clear store dropPending (full ack in Phase 3) |
| `src/host/modules/open-modal.ts` | Wire only if open entry needs gen bump changes |
| `src/host/modules/props-render-close.ts` | On close: do not persist force-drop; optional IDB put of last projection |

## Pure consumed by host (already built)

| Global / module | Use |
|-----------------|-----|
| `PRModalDetailStore` | apply*, toAppDetail, fromAppDetail |
| `PRModalDetailIdb` | sanitize, get/put, sameHeadSha, mayReuse* |
| `PRModalSetAuthority` or store exports | mergeBySetAuthority, filterCache* |

## Dual-write / assembled (rebuild, avoid hand-edit)

| Path | Notes |
|------|-------|
| `src/pr-modal-host.js` | `npm run build:host` output |
| `src/host/parts/*.js` | Only if pipeline still dual-writes; prefer modules SoT |

## Tests

| Path | Role |
|------|------|
| `tests/stale-local-review-drop.rstest.ts` | open-modal filter wiring strings / pure path |
| `tests/detail-patch-contract.rstest.ts` | touch only if openGen/meta split assertions live here |
| `tests/architecture-gates.rstest.ts` | optional: forbid reinject without set-authority helpers |
| `tests/e2e/features/detail-cache.mjs` + `.rstest.ts` | reopen / cache |
| `tests/e2e/features/start-review.mjs` | pending after open (parity smoke) |
| `tests/e2e/features/refresh-action.mjs` | soft refresh |

## Build / verify

```bash
npm run build:pure
npm run build:host
# reload extension
npx rstest run tests/stale-local-review-drop.rstest.ts
# optional e2e
```

## Behavioral checks (manual or e2e)

1. Cold open PR: progressive stages still advance (meta → files/threads).  
2. Dirty IDB with stale pending + network no VPR → UI ends with no pending after settle.  
3. Network has VPR + pending comments → UI shows pending even if IDB had `_dropPending`/empty pending.  
4. Files/commits: failure does not mark false settled empty authority.

## Explicit non-goals

- Removing progressive skeleton/load bar  
- App `localDetail` removal (Phase 3+)  
- Full mutation command split  

## Exit criteria

- [ ] No cache reinject path ignores settled host empty set for review/pending slices  
- [ ] Progressive open still multi-stage  
- [ ] IDB write remains sanitize-on-publish style  
- [ ] Host build green; extension reload verified for open path  

## Next

Phase 3 — patch ack + DomainContext; stop writing domain via setLocalDetail.
