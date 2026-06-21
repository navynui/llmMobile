# UI Improvement Plan for llmMobile

## Overview
This document outlines the planned user interface improvements to reorganize and streamline the llmMobile application based on user feedback.

## Current Structure
- Main tabs: Server, Chat, Generator, Gallery, More
- More tab contains: Downloader, Benchmarks, Settings subtabs

## Planned Changes

### 1. Move Downloader Section to Server Tab
- **Source**: `stub-tabs.js` → `renderDownloaderView()` method
- **Destination**: `server-tab.js` → Add as the last section in the tab
- **Details**: Move the entire HF Model Downloader UI (search, results, repo details, active downloads) to appear after the existing Models Config and Edit models.ini sections in the Server tab.

### 2. Move Real-Time System Logs to Server Tab
- **Source**: `stub-tabs.js` → Logs section within `renderSettingsView()` (specifically the logs-terminal for llm-server/llm-mobile containers)
- **Destination**: `server-tab.js` → Add as a new section, likely after the System Metrics card or as a dedicated logs section
- **Details**: Include the container selector (LLM Server/Manager), line count selector, refresh button, and logs terminal.

### 3. Rename ...More tab to Benchmark
- **Location**: `llm-app.js` 
- **Changes**:
  - Update sidebar menu item: change "••• More" to "📊 Benchmarks" 
  - Update tab bar item: change "••• More" to "📊 Benchmarks"
  - Update route handler: change case '#/more' to case '#/benchmarks'
  - Update component import: replace `./components/stub-tabs.js` with appropriate benchmark component (may need to create new file or reuse)

### 4. Move Benchmark Execution Logs to Benchmark Tab
- **Source**: `stub-tabs.js` → Benchmark Execution Logs section within `renderSettingsView()` (benchmark-logs-terminal)
- **Destination**: Benchmark tab → Add as the bottom section
- **Details**: Include the line count selector, refresh button, and benchmark logs terminal appearing below the benchmark rankings table.

### 5. Additional Cleanup Items
- **Server tab**: Verify Start/Stop/Status controls are present (they are)
- **Auto-Load Model**: Remove setting and hardcode to always `true`
- **Polling Interval**: Remove setting and hardcode to `5` seconds
- **Legacy Batch Mode**: Remove setting as it's no longer in use
- **Stub Tab transformation**: Convert to primarily Benchmark tab with:
  - Benchmarks view (rankings table) as main content
  - Benchmark Execution Logs as bottom section

## Implementation Approach

### Phase 1: Stub Tab Refactor
1. Create new `benchmark-tab.js` component (or modify existing stub-tabs)
2. Move benchmark-related logic from stub-tabs to benchmark-tab
3. Update llm-app.js to route '#/benchmarks' to new benchmark-tab

### Phase 2: Server Tab Enhancement
1. Add Downloader section to server-tab.js (copied from stub-tabs renderDownloaderView)
2. Add Real-Time System Logs section to server-tab.js (copied from stub-tabs settings view logs)
3. Ensure proper styling and state management

### Phase 3: Settings Cleanup
1. Remove Auto-Load Model setting from settings view (if settings tab remains for other purposes)
2. Fix Polling Interval to 5 seconds in relevant locations
3. Remove Legacy Batch Mode toggle

### Phase 4: Navigation Updates
1. Update llm-app.js sidebar and tab bar labels
2. Update route handling
3. Test all navigation paths

## Files to Modify
- `src/llm-app.js` - Route and navigation updates
- `src/components/server-tab.js` - Add Downloader and Logs sections
- `src/components/benchmark-tab.js` (new or modified) - Benchmark view + execution logs
- `src/components/stub-tabs.js` - Remove migrated sections (or refactor)

## Validation Steps
1. After each change, run `npm run build` to ensure Lit/Vite compilation succeeds
2. Verify all moved functionality works correctly in new locations
3. Ensure no regression in existing features
4. Check responsive behavior on mobile and desktop
