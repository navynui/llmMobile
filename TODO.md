# TODO: Fix White Screen on Android Chrome / PWA

## Status: Fixes Applied So Far

### ✅ Fixed — Clear Finished Downloads 500 error
- **Root cause:** Route handler did `from services.download_svc import clear_finished_downloads` but `download_svc.py` was removed in Phase J refactoring.
- **Fix:** Changed import to `from services.download.api import clear_finished_downloads`.
- Deployed and live.

### ❌ Cannot fix in code — `beacon.min.js` ERR_CONNECTION_REFUSED
- `static.cloudflareinsights.com/beacon.min.js` is injected by Cloudflare's proxy layer (orange-cloud mode) automatically — it's Cloudflare Real User Monitoring (RUM).
- The injection happens at the edge, not in our source code. There is no `<script>` tag for it in `index.html` or any of our files.
- **Fix:** Disable RUM in Cloudflare dashboard at **Speed → Optimization → RUM**.

### ❌ Cannot fix in code — `/manifest.json` CORS / Cloudflare Access redirect
- Cloudflare Zero Trust intercepts ALL requests to `llm.navynui.cc` including static assets like `/manifest.json`, `/sw.js`, etc.
- The browser's `<link rel="manifest">` tag or the Service Worker's `cache.addAll()` triggers a fetch that gets redirected to the Cloudflare Access login page. The login response lacks `Access-Control-Allow-Origin` → CORS error.
- **Fix (Cloudflare side):** Create Access exclusion rules for static asset paths under **Zero Trust → Access → Applications**.
- **Fix (code side — not attempted yet):** Create a proper `public/manifest.json` and increment the SW cache name so old broken caches are discarded.

---

## Root Causes (Unresolved)

### 1. Missing `manifest.json` file
- `index.html` references `/manifest.json`, `sw.js` caches it, but `public/manifest.json` does not exist.
- Even if we create it, Cloudflare Access will still intercept the request unless an exclusion rule is added.

### 2. Cloudflare Access intercepts static assets
- All requests to `llm.navynui.cc` go through Zero Trust authentication.
- Static assets (`/manifest.json`, `/sw.js`, `/favicon.svg`, `/icons.svg`, `/assets/*`) get redirected to login.
- The login redirect response lacks CORS headers → browser blocks the response.

### 3. Service Worker stale cache
- `sw.js` uses stale-while-revalidate. Old (possibly broken) cached responses persist across deployments.
- On Android phone (no keyboard), user can't do Ctrl+Shift+R to force clear SW cache.
- This is likely the **primary cause of the white screen** on phone after code changes.

### 4. `beacon.min.js` blocked
- Cloudflare RUM script fails to load (`ERR_CONNECTION_REFUSED`). Harmless but clutters console.
- Some corporate/ISP networks or ad-blockers may block `cloudflareinsights.com`.

---

## Proposed Fixes (waiting for review)

### Fix 1: Create `public/manifest.json`
- [ ] Create a proper `manifest.json` in `public/` with:
  - App name "LLM Mobile", short name, description
  - `start_url: "/"`, `display: "standalone"`
  - Icons referencing existing `/icons.svg` and `/favicon.svg`

### Fix 2: Cloudflare Access exclusion rules (Cloudflare dashboard)
- [ ] In **Zero Trust → Access → Applications**, edit the app for `llm.navynui.cc`
- [ ] Add an exclusion ("Skip" action) for paths:
  - `/manifest.json`
  - `/sw.js`
  - `/favicon.svg`
  - `/icons.svg`
  - `/assets/*`
- This allows browsers to fetch PWA-critical assets without auth redirects.

### Fix 3: Service Worker cache-busting
- [ ] Bump `CACHE_NAME` in `public/sw.js` from `llm-mobile-v1` to `llm-mobile-v2`
- [ ] This forces old caches to be deleted on the next SW activation, clearing any broken cached state from previous deployments.

### Fix 4: Safe-guard SW against caching Cloudflare login pages
- [ ] Before caching a fetched response, check `response.url` doesn't point to `navynui.cloudflareaccess.com`
- [ ] Also verify `response.status === 200` and `response.type === 'basic'` (same-origin)
- [ ] Prevents accidentally caching the Cloudflare Access login HTML as static content.

### Fix 5: Add SW update prompt for mobile
- [ ] Add a visible "Update available — tap to reload" banner that calls `triggerUpdateReload()`
- [ ] Currently `llm-app.js` tracks `updateAvailable` but never shows it to the user
- [ ] Gives mobile users a way to activate the new SW without a keyboard shortcut

### Fix 6: Disable Cloudflare RUM (Cloudflare dashboard)
- [ ] In **Speed → Optimization → RUM**, turn off Real User Measurement
- [ ] This stops the `beacon.min.js` injection at the edge

---

## Testing Checklist

- [ ] Run `npm run build` — Vite bundles successfully
- [ ] Rebuild and redeploy Docker container
- [ ] On Android Chrome (phone): navigate to app, confirm page renders fully
- [ ] Install as PWA, confirm it opens without white screen
- [ ] On Android tablet: test without keyboard shortcut
- [ ] Verify SW cache is cleared (old caches deleted on new SW activation)
- [ ] Verify `/manifest.json` returns 200 (not a Cloudflare redirect)
- [ ] Push an update and verify "Update available" prompt appears
