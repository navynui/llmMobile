# TODO.md — Frontend Component Architecture Refactor

> **Context:** `src/components/` has grown to ~5,600 LOC across 5 monolithic tabs. Several UI/JS patterns are duplicated in every file (cards, buttons, API fetching, loading states, polling). This doc breaks down concrete, incremental steps to make the frontend scalable, concise, and testable without breaking the existing Lit/Vite build.

---

## 🔴 P0 — Do First (Highest Leverage)

### 1. Extract Shared CSS Primitives
**Goal:** Eliminate duplicated `.card`, `.btn`, `.pill`, backdrop-filter, and animation blocks.

**Deliverable:** `src/components/_primitives.js`
- Exports ready-to-use `css` blocks:
  - `cardStyles` — bg, border, radius, shadow, backdrop-filter, hover glow
  - `buttonStyles` — primary / secondary / danger variants, active states
  - `pillStyles` — filter chip style, active state
  - `textInputStyles` — focus ring, transition
  - `modalOverlayStyles` — backdrop blur, centering
  - `spinnerStyles` — loading animation
  - `slideInAnimation` / `fadeInAnimation`
- Each tab imports and composes: `static styles = css`${cardStyles} ${buttonStyles} ...`;

**Why first:** One copy-paste change per file instantly shrinks styles, enforces design consistency, and makes future theming trivial.

### 2. Extract Shared API Fetch Utility
**Goal:** Stop repeating `try/catch + toast + loading toggle` in every method.

**Deliverable:** `src/utils/api.js`
- `apiFetch(url, opts)` — wraps `fetch`, parses JSON, normalizes errors.
- `apiPost(url, body)` / `apiDelete(url)`.
- `apiFetchWithToast(url, opts, { successMsg, errorMsg })` — auto-shows toast on failure.
- `apiFetchWithLoading(propertyRef, url, opts)` — sets `propertyRef = true` on start/error/complete.

**Result:** `benchmark-tab.js` line 604 becomes:
```js
const data = await apiFetch('/api/chat/completions', { ... });
```
Instead of 15 lines of boilerplate.

---

## 🟠 P1 — Structural Splits (Reduce Monoliths)

### 3. Split `server-tab.js` into Child Components
**Goal:** `server-tab.js` is 1,661 lines and handles 5 unrelated concerns.

**Deliverable child elements:**

| Child Element | Responsibility | Approx Lines Saved in Parent |
|---|---|---|
| `<server-status-card>` | Container restart, start/stop, status display | ~200 |
| `<models-config-editor>` | models.ini textarea, save/scan/delete model | ~400 |
| `<model-downloader>` | HuggingFace search, repo details, download queue | ~500 |
| `<server-logs>` | Log viewer, container selector, line limit | ~300 |

**Pattern:**
```js
// parent
render() {
  return html`
    <server-status-card .stats=${this.stats} .status=${this.status} @restart=${this._onRestart}></server-status-card>
    <models-config-editor .text=${this.modelsIniText} @save=${this._onSaveIni}></models-config-editor>
    ...
  `;
}
```
Parent becomes a thin orchestrator delegating to children.

### 4. Split `benchmark-tab.js` Concerns
**Deliverable:** `<benchmark-table>` (sort/filter/pagination) and `<benchmark-runner>` (queue builder, progress, logs). Reduces parent to ~400 lines of orchestration.

---

## 🟡 P2 — Reusable Primitives

### 5. Confirm Dialog Primitive
**Goal:** Replace scattered `confirm()` calls (stop server, delete model, delete image) with a styled, consistent modal.

**Deliverable:** `src/components/_confirm.js` + `<confirm-dialog>` custom element.
```js
import './_confirm.js';
// usage
await this.dispatchEvent(new CustomEvent('confirm', {
  detail: { title: 'Delete model?', message: '...' },
  bubbles: true, composed: true, cancelable: true
}));
```
Or simpler: expose `Confirm.show(title, message)` returning a Promise.

### 6. Polling Mixin / Hook
**Goal:** Stop repeating `setInterval` + `clearInterval` + loading toggle for logs/status/benchmarks.

**Deliverable:** `src/utils/polling.js`
```js
class PollingMixin {
  startPolling(url, intervalMs, callback) { ... }
  stopPolling() { ... }
}
```
Tabs extend the mixin and call `this.startPolling('/api/logs', 3000, this._onLogsUpdate)`.

### 7. Data Table Component
**Goal:** Table rendering, sorting, filtering, and pagination appear in `benchmark-tab.js` only today, but will soon be useful for model lists, queue lists, etc.

**Deliverable:** `<data-table .columns=${[]} .rows=${[]} .sortable=${true} @sort=${handler}>`
- Accepts column definitions: `{ key, label, render?, width? }`
- Built-in sort indicator and ascending/descending toggle
- Optional row click handler
- Slot-based header/footer

### 8. Toast / Notification Service
**Goal:** Every component currently manages its own toast DOM/CSS.

**Deliverable:** `src/utils/toast.js` + `<toast-host>` (singleton in `llm-app.js`).
```js
Toast.show('Model loaded', 'success');
Toast.show('Failed to connect', 'error');
```
Components import the service and never render toast markup themselves.

---

## 🟢 P3 — Polish & Maintainability

### 9. Centralize Icon Set
**Goal:** Inline SVGs are repeated across tabs (play, stop, trash, download, refresh).

**Deliverable:** `src/assets/icons.js`
```js
export const icons = {
  play: html`<svg ...>...</svg>`,
  stop: html`<svg ...>...</svg>`,
  trash: html`<svg ...>...</svg>`
};
```
Usage: `${icons.play}` in template.

### 10. State Mixin for Tab Boilerplate
**Goal:** Every tab repeats patterns like `loadingX`, `errorX`, `hasX`.

**Deliverable:** `src/utils/state-mixin.js`
```js
class StateMixin {
  setLoading(prop, val) { this[prop + 'Loading'] = val; }
  withLoading(prop, asyncFn) { ... }
}
```

### 11. CSS Custom Properties Audit
**Goal:** Ensure every magic number is in `index.css` so `_primitives.js` stays purely variable-driven.

**Checklist:**
- [ ] Radius values: `--radius-sm`, `--radius-md`, `--radius-lg`
- [ ] Shadow stack: `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- [ ] Color aliases: `--bg-elevated`, `--text-tertiary`
- [ ] Transition defaults: `--transition-fast`, `--transition-smooth`

### 12. Add Frontend Tests for Extracted Parts
**Goal:** As we split components, ensure they remain correct.

**Deliverable:**
- `tests/components/` folder.
- Smoke test for each new child component (renders without error, fires events).
- Test for `apiFetch` utility (mock fetch responses, errors, loading states).

---

## ⚙️ Execution Rules (Follow on Every Step)

1. **One file at a time.** Edit → `npm run build` → fix if Vite errors → commit-ready state.
2. **No feature changes during refactor.** Pure extract/move only. Behavior must be identical before and after.
3. **Preserve mobile-first styling.** All new primitives must remain touch-friendly.
4. **Keep `traceback` and other backend rules intact.** Frontend changes do not touch `app/main.py`.

---

## ⚠️ Extra Safety Cautions (Apply During Every Refactor Step)

### Confirm-dialog migration
- Replacing `window.confirm` with a custom modal changes the flow from synchronous blocking to async Promise-returning.
- Update **every** caller to `await` the dialog result. A missing `await` will cause the user action (delete / stop server) to fire immediately before the user confirms.
- Add a safety net: if the custom modal fails to render, fall back to `window.confirm` so destructive operations still require explicit consent.
- After migrating `confirm()`, smoke-test the critical paths: stop server, delete model, delete image.

### API utility migration
- Centralising fetch logic in `apiFetch` must not mutate request URLs, bodies, or response parsing semantics.
- Preserve existing handling for non-JSON endpoints (streaming `/api/chat/completions`, log downloads). If the server returns non-JSON, the utility should pass through the raw response instead of throwing a JSON parse error.
- If callers depend on exact error message strings from previous ad-hoc `try/catch` blocks, keep those messages unchanged or update all affected UI/tests together.

### Component-split contracts
- Splitting `server-tab.js` into child elements must preserve the exact public contract: every bound property, event name, and casing must remain unchanged for existing callers.
- Verify child components with a smoke test: they must render without Lit errors, reflect property changes, and re-emit events with the same names the parent expects.
- After each split, diff the parent render method and event handlers to ensure no action was accidentally swallowed by the child.

---

## 📅 Suggested Order

1. `_primitives.css/js` (P0.1)
2. `utils/api.js` (P0.2)
3. Split `server-tab.js` children (P1.3)
4. `<confirm-dialog>` + `<toast-host>` (P2.5, P2.8)
5. `PollingMixin` (P2.6)
6. `<data-table>` (P2.7)
7. Remaining P2/P3 items as needed.
