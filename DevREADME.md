# Workday - Schedule Tool (Developer Guide)

This repo contains a Chrome (Manifest V3) extension that extracts course schedules from Workday, renders a weekly view, and exports calendars. This document covers local setup, build steps, and project structure.

Make sure Node.js (https://nodejs.org) is installed on your device.

---

## Contributing

- Read this WHOLE file BEFORE you start touching ANYTHING.
- Keep commits focused and small.
- Avoid adding new permissions unless necessary.
- Follow existing formatting and code style (plain JS, no TypeScript).
- If you run into issues, let me know: gwantanak.3@gmail.com

---

## Quick Start

1. Install dependencies

```powershell
npm install
```

2. Build the extension (generates `dist/`)

```powershell
npm run build
```

3. Load in Chrome

- Open `chrome://extensions`
- Enable "Developer mode"
- Click "Load unpacked"
- Select the repo root folder (the one that contains `manifest.json`)

After making changes to source files, rebuild and then click "Reload" on the extension.

---

## Project Structure

- `src/` extension source
    - `src/background.js` service worker entry
    - `src/content.js` content script entry (main UI, schedule rendering, buttons)
    - `src/panel.html` extension panel UI

    - `src/averageGrades/` UBC Grades API integration
    - `src/core/` shared core helpers used across features
    - `src/css/` styles (copied into `dist/css/` at build)
        - `src/css/css-imports.css` if you ever add a css file, make sure to import it here and add it to, const cssFiles (in src\mainPanel\loadMainPanel.js)
        - `src/css/colors/` color tokens and theme files
            - `src/css/colors/theme-tokens.css` color tokens (where colors are set for the whole extension; need to change a color? use this file)
        - `src/css/formatting/` layout and component styling
    - `src/exportLogic/` calendar export helpers
    - `src/extraction/` Workday DOM parsing and schedule extraction
        - `src/extraction/parsers/` text/DOM parsers for course and meeting details
    - `src/mainPanel/` schedule panel UI rendering and interactions
    - `src/utilities/` shared utilities (debug, DOM, shadow mount, etc.)

- `dist/` build output consumed by `manifest.json`
- `node_modules/` dependencies installed by npm (local dev only)

---

## Average Grade Feature

The "Class Averages (Past 5 Years)" button in Workday pulls data from the public UBC Grades API (`https://ubcgrades.com/api`). It only shows values for supported UBC courses. If the API does not return data, the UI shows "Average: unavailable".

Relevant files:

- `src/averageGrades/gradesApiCall.js`
- `src/content.js`

---

## Manifest Notes

`manifest.json` references built assets in `dist/`, including:

- `dist/background.js`
- `dist/content.js`
- `dist/panel.html`
- `dist/css/...`

Make sure `dist/` exists before loading the extension.

---

## Troubleshooting

- If the extension loads but nothing appears: confirm you are on a `*.myworkday.com` page that lists registered courses, then reload the extension.
- If CSS is missing: rebuild and verify `dist/css/` exists.
- If class averages fail: the API may not have data for the course, or the request may be blocked by network settings.

### Using the Debug Tool (for more detail, see src/utilities/debugTool.js)

Logging is controlled by `src/utilities/debugTool.js`. By default, `global` logging is `false`, so nothing prints unless you enable it.

Quick ways to enable logs:

1. Temporary global on (fastest): edit `src/utilities/debugTool.js` and set:

```js
const logConfiguration = {
  global: true,
  local: {},
  log: {},
};
```

2. To see the output of a specific method, ensure this import is has been added to the file: 

```js
import { debugLog } from "./utilities/debugTool.js";
```

Then add this near the top of the file you care about (example for schedule extraction, courseExtraction method):
```js
debugLog({ global: true, local: { courseExtraction: true } });
```

After changes:

- Rebuild (`npm run build`)
- Reload the extension in `chrome://extensions`
- Open DevTools (ctrl+shift+i) on the Workday page and check the console

Tip: each log includes a prefix like `[Workday - Schedule Tool (file: courseExtraction)]` and many logs include an `id` to help you filter.

### Adding a New Debug Log (eg. for file newFeatureFile.js)

1. Create (or reuse) a scoped logger at the top of the file:

```js
import { debugFor } from "../utilities/debugTool.js";
const debug = debugFor("newFeatureFile");
```

2. Add a log inside your new method:

```js
function newFeatureMethod(rows) {
  // code...
  debug.log({ id: "newFeatureMethod.done" }, "NewFeatureMethod row count", { rowsCount: rows.length });
}
```

3. Turn logs on for that scope while debugging:

```js
debugLog({ global: true, local: { newFeatureFile: true } });
```

Notes:

- Use a stable `id` (e.g., `feature.action`) so you can filter or disable specific logs later.
- Prefer structured objects for context rather than long strings.