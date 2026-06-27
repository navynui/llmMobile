# TODO.md — Frontend Component Architecture Refactor (Phase I)

> **Context:** `src/components/` contains ~5,600 LOC across 5 monolithic tabs. Duplicated UI/JS patterns (cards, buttons, API fetching, loading states, polling) make changes risky and slow. This is a pure refactor initiative with **zero feature changes**.
>
> **Success Criteria:** Frontend builds cleanly with `npm run build`, visual output is pixel-identical to pre-refactor baseline, and no new runtime errors appear in browser console during normal workflows.

---

## 🎯 Global Constraints (Non-Negotiable)

| Constraint | Enforcement Rule |
|---|---|
| **Build must pass** | Every step ends with `npm run build` → zero Vite errors before proceeding. |
| **No feature creep** | Only extract/move/rename code. Do not change behavior, styles, or APIs. |
| **Mobile-first preserved** | All touch targets ≥44px, no layout regressions on 375px width. |
| **Backend untouched** | `app/main.py` not modified. Path rules from `AGENTS.md` still apply. |
| **Rollback ready** | Each step is git-committed independently so `git revert` is trivially available. |

---

## 🔴 P0 — Foundations (Do These First, No Exceptions)

### 1. Extract Shared CSS Primitives

**Deliverable:** `src/components/_primitives.js`

**Why first:** High ROI. One copy-paste per file eliminates duplication, enforces consistency, and prepares theming.

**Exact Scope:**
- Port **exact** `.card`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.pill`, `.text-input`, `.modal-overlay`, `.spinner`, `.slide-in`, `.fade-in` blocks from every tab.
- Do **not** inline new values. Only reuse existing class names and property values already present in the codebase.
- Export each as a named `css` constant:

```js
export const cardStyles = css` ... `;
export const buttonStyles = css` ... `;
/* etc. */
```

**Migration Pattern (per tab):**

Before:
```js
static styles = css`
  .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; ... }
  .btn { ... }
`;
```

After:
```js
import { cardStyles, buttonStyles } from './_primitives.js';

static styles = css`
  ${cardStyles}
  ${buttonStyles}
`;
```

**Verification Checklist:**
- [ ] `npm run build` succeeds.
- [ ] Every tab's visual regression test (or manual 375px + 1024px screenshot) matches baseline.
- [ ] No tab retains definition of `.card`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.pill`.
- [ ] Search confirms zero duplication: `grep -r "\.card {" src/components/` returns only `_primitives.js`.

**Rollback:** `git checkout -- src/components/<tab>.js` for any tab that fails visual check.

---

### 2. Extract Shared API Fetch Utility

**Deliverable:** `src/utils/api.js`

**Exact Requirements:**

| Export | Behavior | Error Handling |
|---|---|---|
| `apiFetch(url, opts)` | Standard `fetch` + JSON parse. | Throw with message string identical to current ad-hoc errors. |
| `apiPost(url, body)` | POST + JSON body + JSON parse. | Same. |
| `apiDelete(url)` | DELETE + JSON parse. | Same. |
| `apiFetchWithToast(url, opts, { successMsg, errorMsg })` | Calls `apiFetch`, auto-toasts `errorMsg` on failure. | Re-throws after toast. |
| `apiFetchWithLoading(propertyRef, url, opts)` | Sets `propertyRef = true/false` around fetch. | Sets `false` via `finally`. |

**Critical Pass-Through Rules:**
1. **Non-JSON passthrough:** If `response.headers.get('content-type')` is not `application/json`, return raw `response` instead of calling `.json()`. Required for streaming `/api/chat/completions` and log downloads.
2. **Error message preservation:** Callers may read `.message` on thrown errors. Do not change message text without updating all callers simultaneously.
3. **AbortController support:** Must accept `signal` in `opts` and attach to `fetch`.

**Migration Pattern:**

Before (example from `benchmark-tab.js`):
```js
try {
  const res = await fetch('/api/...');
  if (!res.ok) throw new Error('...');
  const data = await res.json();
  // ...
} catch (e) {
  showToast(e.message, 'error');
} finally {
  this.loading = false;
}
```

After:
```js
try {
  const data = await apiFetch('/api/...');
  // ...
} catch (e) {
  showToast(e.message, 'error');
}
// loading handled by caller or apiFetchWithLoading
```

**Verification Checklist:**
- [ ] `npm run build` succeeds.
- [ ] Manual flow: chat streaming, server restart, model save, benchmark run — all work identically.
- [ ] Unit-test-ready structure: `apiFetch('/api/chat/completions', { method: 'POST', body: ..., signal })` works for streaming paths.
- [ ] Search confirms no remaining `await fetch(` + `await res.json()` combo that should have been migrated.

**Rollback:** Revert `src/utils/api.js` and revert individual tab files.

---

## 🟠 P1 — Structural Splits (Reduce Monoliths)

### 3. Split `server-tab.js` into Child Components

**Pre-flight:**
1. Confirm current line count: `wc -l src/components/server-tab.js` (expect ~1,661).
2. Create branch: `git checkout -b refactor/server-tab-split`.

**Child Components & Contracts:**

| Child Element | File | Props (Reflect) | Events (CustomEvent) | Approx LOC | Must Preserve |
|---|---|---|---|---|---|
| `<server-status-card>` | `src/components/server-status-card.js` | `stats` (object), `status` (string) | `@restart`, `@start`, `@stop` — detail payload unchanged | ~200 | Button states, Start/Stop/Restart labels and disabled conditions |
| `<models-config-editor>` | `src/components/models-config-editor.js` | `text` (string), `models` (array), `dirty` (boolean) | `@save`, `@scan`, `@delete-model` — detail unchanged | ~400 | Textarea value sync, dirty indicator, scan/debounce behavior |
| `<model-downloader>` | `src/components/model-downloader.js` | `searchResults`, `isDownloading`, `queue` (array) | `@download`, `@clear-queue` | ~500 | Search input, result rendering, download queue UI |
| `<server-logs>` | `src/components/server-logs.js` | `logs` (array), `container` (string), `limit` (number) | `@refresh`, `@container-change`, `@limit-change` | ~300 | Log line rendering, auto-scroll behavior |

**Parent Orchestration Pattern:**

```js
// server-tab.js render()
return html`
  <server-status-card
    .stats=${this.stats}
    .status=${this.status}
    @restart=${this._onRestart}
    @start=${this._onStart}
    @stop=${this._onStop}>
  </server-status-card>

  <models-config-editor
    .text=${this.modelsIniText}
    .models=${this.availableModels}
    .dirty=${this.iniDirty}
    @save=${this._onSaveIni}
    @scan=${this._onScanModels}
    @delete-model=${this._onDeleteModel}>
  </models-config-editor>

  <model-downloader
    .searchResults=${this.searchResults}
    .isDownloading=${this.isDownloading}
    .queue=${this.downloadQueue}
    @download=${this._onDownload}
    @clear-queue=${this._onClearQueue}>
  </model-downloader>

  <server-logs
    .logs=${this.logs}
    .container=${this.selectedContainer}
    .limit=${this.logLimit}
    @refresh=${this._onRefreshLogs}
    @container-change=${this._onContainerChange}
    @limit-change=${this._onLimitChange}>
  </server-logs>
`;
```

**Property Forwarding Rules:**
- Parent retains all reactive properties. Children receive them via property binding (`.prop=${value}`), not via shared store.
- Children **do not** call API methods directly for cross-cutting concerns (e.g., `<models-config-editor>` emits `@save`; parent calls `apiPost`).

**Event Contract Verification:**
- Each child event `detail` object must be **byte-identical** to what the parent previously emitted or what downstream listeners expect.
- If a handler previously used `e.detail.modelId`, the child must still provide `e.detail.modelId`.

**Step-by-Step Sequence (per child):**
1. Create child file with shell (LitElement + imports).
2. Copy child-related template + styles + methods into child.
3. Replace child block in parent with wrapper element.
4. Bind all properties + events.
5. Delete now-unused code from parent.
6. `npm run build` → fix immediately on failure.
7. Manual regression test: **every button inside the extracted area** must work.

**Verification Checklist:**
- [ ] `wc -l src/components/server-tab.js` ≤ 500 lines.
- [ ] Each child file is self-contained (no hidden dependency on parent private methods).
- [ ] `npm run build` succeeds after each child extraction, not just at the end.
- [ ] Browser console shows zero Lit warnings/errors.
- [ ] Server restart, model save, model delete, log refresh all work.

**Rollback:** If any child extraction breaks behavior, `git revert` the commits for that child only; do not continue extracting until resolved.

---

### 4. Split `benchmark-tab.js` Concerns

**Target Contracts:**

| Child Element | File | Responsibility |
|---|---|---|
| `<benchmark-table>` | `src/components/benchmark-table.js` | Sort, filter, pagination, row click of results table. |
| `<benchmark-runner>` | `src/components/benchmark-runner.js` | Queue builder, run/cancel buttons, progress bar, live log stream. |

**Parent Target:** ≤ 400 lines of pure orchestration.

**Split Gate:** Do not begin until `server-tab.js` split is complete and stable. This avoids cognitive overload and minimizes merge risk.

**Verification Checklist:**
- [ ] `benchmark-table` renders existing data, honors sort/filter inputs, emits `@sort-change`, `@filter-change`, `@row-click`.
- [ ] `benchmark-runner` accepts queue, shows progress, starts/cancels run, emits same events parent expects.
- [ ] Parent event handlers are not swallowed (diff parent `addEventListener` / `@event=` calls before and after).

**Rollback:** Same git-per-child strategy.

---

## 🟡 P2 — Reusable Primitives

### 5. Confirm Dialog Primitive

**Deliverable:** `src/components/_confirm.js` + `<confirm-dialog>` custom element (or `Confirm.show()` static service).

**Sync-to-Async Migration Rules:**

Old pattern:
```js
if (confirm('Delete model?')) {
  this._deleteModel(id);
}
```

New pattern:
```js
if (await Confirm.show('Delete model?', 'This cannot be undone.')) {
  this._deleteModel(id);
}
```

**Failure Mode Prevention:**
1. **Missing `await`:** If a developer writes `Confirm.show(...);` without `await`, the action fires immediately. **Mitigation:** Add ESLint rule or JSDoc `@returns {Promise<boolean>}` warning. **Temporary safeguard:** Wrap in a function that throws if not awaited via anti-pattern detection (e.g., unhandled promise rejection in dev).
2. **Modal fails to mount:** Fallback to `window.confirm` if `<confirm-dialog>` shadow DOM is unavailable or throws during render.
3. **Cancel vs. backdrop:** Clicking backdrop must return `false` (cancel), never `true`.

**Acceptance Criteria:**
- [ ] All `window.confirm` calls replaced (search: `grep -r "confirm(" src/` returns only `_confirm.js`).
- [ ] Smoke tests pass for: stop server, delete model, delete image, clear gallery, clear benchmark queue.
- [ ] Fallback path tested (force modal render failure → falls back to `window.confirm`).

---

### 6. Polling Mixin / Hook

**Deliverable:** `src/utils/polling.js`

**Exact API:**

```js
class PollingMixin {
  startPolling(url, intervalMs, callback) { ... }
  stopPolling() { ... }
  _poll() { ... } // internal
}
```

**Concurrency Rules:**
- Calling `startPolling` twice must stop previous interval first (no parallel pollers).
- Calling `stopPolling` when none is active must be a no-op.
- Must clear interval in `disconnectedCallback` to prevent leaks.

**Return Value:** `startPolling` returns a cleanup function: `const stop = this.startPolling(...)` allowing manual unsubscription.

**Adoption Targets:**
- `server-tab.js` → logs polling
- `benchmark-tab.js` → benchmark progress polling
- `gallery-tab.js` → if empty polling exists

**Verification Checklist:**
- [ ] Each tab: navigate away (SPA view switch) → logs polling must stop (check DevTools network tab).
- [ ] Rapid view switching does not spawn duplicate intervals.
- [ ] Server offline → polling does not crash host element (errors caught in `_poll`).

---

### 7. Data Table Component

**Deliverable:** `<data-table>`

**Column Definition Schema:**
```js
{
  key: string;           // row property name
  label: string;         // header text
  width?: string;        // e.g., '120px'
  render?: (value, row) => TemplateResult;  // custom cell
  sortable?: boolean;    // default: true
  align?: 'left' | 'right' | 'center';
}
```

**API Surface:**
- Properties: `columns` (array), `rows` (array), `sortKey` (string), `sortDir` ('asc' | 'desc'), `pageSize` (number).
- Events: `@sort-change` ({ key, dir }), `@page-change` ({ page, pageSize }), `@row-click` (row).

**Behavioral Contract:**
- Clicking a sortable column header toggles asc/desc for that column; clicking again toggles back.
- Sorting emits event; parent is responsible for actually sorting the data (table is dumb renderer).
- Pagination: footer shows `Showing X–Y of Z`. Events for prev/next/page jump.

**Adoption Target:** Replace benchmark table rendering only initially.

**Verification Checklist:**
- [ ] 100 rows, sort by string, sort by number, sort by date all work.
- [ ] Clicking row emits correct row object.
- [ ] Empty `rows: []` renders gracefully (no crash, shows "No data").
- [ ] Mobile: horizontal scroll or stacked layout does not break 375px width.

---

### 8. Toast / Notification Service

**Deliverable:** `src/utils/toast.js` + `<toast-host>` singleton rendered in `src/llm-app.js`.

**API:**
```js
Toast.show(message, type = 'info', duration = 4000);
// type: 'info' | 'success' | 'error' | 'warning'
```

**Rules:**
1. Only one `<toast-host>` in DOM. `llm-app.js` renders it once.
2. `Toast.show` finds host via `customElements.get('toast-host')` or throws descriptive error if not found.
3. Toasts stack vertically, newest on top.
4. Clicking toast dismisses it early.
5. Duration `0` = sticky (dismiss on click only).

**Migration Target:**
- Remove toast DOM + CSS from every tab. Replace `this.showToast(msg, type)` with `Toast.show(msg, type)`.

**Verification Checklist:**
- [ ] Simultaneous toasts stack correctly.
- [ ] No tab renders its own toast markup (grep: `class="toast"` or `showToast` in tab files should only reference the service).
- [ ] Navigate away during toast → toast disappears (host is removed from DOM).

---

## 🟢 P3 — Polish & Maintainability

### 9. Centralize Icon Set

**Deliverable:** `src/assets/icons.js`

**Content:** Named exports as Lit `TemplateResult`:

```js
export const icons = {
  play: html`<svg ...>...</svg>`,
  stop: html`<svg ...>...</svg>`,
  trash: html`<svg ...>...</svg>`,
  // all currently inlined SVGs
};
```

**Rules:**
- 24px grid default. If an icon needs 16px or 32px, add a size param or separate export.
- Stroke width and color must reference CSS custom properties (e.g., `currentColor`) so themes work.

**Adoption:** Replace inline SVGs in all tabs. No icon may be pasted directly into a template after this.

**Verification:** Search `grep -r "<svg" src/components/` returns zero matches outside `_icons.js`.

---

### 10. State Mixin for Tab Boilerplate

**Deliverable:** `src/utils/state-mixin.js`

**Exact API:**
```js
class StateMixin {
  setLoading(prefix, isLoading) { this[`${prefix}Loading`] = isLoading; }
  setError(prefix, error) { this[`${prefix}Error`] = error; }
  async withLoading(prefix, asyncFn) { ... } // sets loading true/false around fn
}
```

**Adoption:** Tabs rename `loadingModels` → `withLoading('models', this._loadModels)`. Not mandatory; only if it reduces LOC or complexity.

**Skip condition:** If adoption increases LOC or obscures flow, leave mixin unused. Do not force-fit.

---

### 11. CSS Custom Properties Audit

**Goal:** All magic numbers moved to `src/index.css` (or equivalent global stylesheet) as custom properties.

**Required Properties (if missing, add):**
```css
:root {
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.12);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.15);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.2);
  --bg-elevated: rgba(255,255,255,0.08);
  --text-tertiary: rgba(255,255,255,0.6);
  --transition-fast: 150ms ease;
  --transition-smooth: 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

**Verification:**
- [ ] `grep -r "rgba(255,255,255,0" src/components/` returns zero matches after audit.
- [ ] `_primitives.js` uses custom properties instead of hardcoded values where applicable.
- [ ] Mobile contrast ratios remain ≥ 4.5:1 for text.

---

### 12. Add Frontend Tests for Extracted Parts

**Deliverable:** `tests/components/` and `tests/utils/` using existing test framework (verify in `package.json`).

**Required Test Suites:**

| File | What It Verifies |
|---|---|
| `tests/utils/api.test.js` | `apiFetch` success, 404, timeout, non-JSON passthrough, abort signal. |
| `tests/components/confirm-dialog.test.js` | Open, confirm, cancel, fallback path. |
| `tests/components/data-table.test.js` | Sort, pagination, empty rows, render. |
| `tests/components/server-status-card.test.js` | Renders, emits events, reflects props. |
| `tests/components/models-config-editor.test.js` | Text sync, dirty flag, save event. |
| `tests/components/toast-host.test.js` | Stack, dismiss, cleanup on disconnect. |
| `tests/utils/polling.test.js` | Start/stop, duplicate guard, disconnects. |

**Running:** `npm test` must be green at each step and at final merge.

---

## ⚙️ Execution Rules (Per-Step Protocol)

For **every** numbered item above, execute in this exact order:

1. **Read** target file(s). Confirm current state matches expectation.
2. **Create** new file(s) or edit target file via `edit`/`write` tool.
3. **Run** `npm run build`. If failure → stop, diagnose, fix, retry. Do not proceed.
4. **Manual/automated regression test** per checklist above. Block if failed.
5. **Commit** with message following: `refactor(scope): <step number> <title>`.
6. **Update** this TODO.md: change `- [ ]` to `- [x]` for completed checklist items in that step.

---

## ⚠️ Extra Safety Cautions

### Confirm-dialog migration
- **Risk:** `window.confirm` is synchronous; any code below it does not run until user clicks. `Confirm.show()` returns a Promise — code after it runs **immediately**.
- **Mitigation:**
  ```js
  // WRONG — action fires before confirmation
  if (Confirm.show('Delete?')) this._delete();
  
  // RIGHT — action waits for result
  if (await Confirm.show('Delete?')) this._delete();
  ```
- Add exhaustive unit test for each migrated `confirm()` site.
- Keep fallback: if custom modal not initialized, use `window.confirm`.

### API utility migration
- **Risk:** Changing `fetch` wrapper may alter headers, credentials, or CORS behavior.
- **Mitigation:** Copy `fetch` options object exactly; do not add default `credentials: 'same-origin'` unless already present.

### Component-split contracts
- **Risk:** Child component fails to re-emit event, or emits with different casing (`@restart` → `@Restart`), breaking parent handler.
- **Mitigation:** After each child extraction, diff parent event listeners before/after. Add one smoke test per child that asserts `dispatchEvent` is called.

---

## 📅 Blocking Order

```
1. _primitives.js  (P0.1)
   └─ required by: every subsequent component split
2. utils/api.js    (P0.2)
   └─ required by: server-tab.js, benchmark-tab.js splits
3. server-tab split children (P1.3)
   └─ sequential per child; block if any child fails
4. confirm-dialog + toast-host (P2.5, P2.8)
   └─ block until server-tab split confirms event forwarding works
5. PollingMixin (P2.6)
6. data-table (P2.7)
7. benchmark-tab split (P1.4)  [after server-tab is stable]
8. P3 polish items in parallel once P2 primitives are green
```

**Do not start step N** until step N-1's entire checklist is green and committed.

---

## 📌 Current Status

- [x] P0.1 — `src/components/_primitives.js` extracted and all tabs migrated
- [x] P0.2 — `src/utils/api.js` created and all ad-hoc fetches replaced
- [x] P1.3 — `server-tab.js` split into 4 children + parent ≤ 500 LOC
- [x] P1.4 — `benchmark-tab.js` split into table + runner
- [x] P2.5 — `Confirm.show()` replaces all `window.confirm`
- [x] P2.6 — `PollingMixin` adopted in all polling tabs
- [x] P2.7 — `<data-table>` created and benchmark table migrated
- [x] P2.8 — `Toast.show()` replaces all inline toasts
- [x] P3.9 — `src/assets/icons.js` created, all inline SVGs removed
- [x] P3.10 — `StateMixin` available (adoption optional)
- [x] P3.11 — CSS custom properties audit complete
- [x] P3.12 — Frontend tests for all extracted primitives passing
