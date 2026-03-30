import { $$ } from "../utilities/dom";
import { debugFor, debugLog } from "../utilities/debugTool.js";

const debug = debugFor("grid");
debugLog({ local: { grid: false } });

// Normalizes text for matching. Input: string. Output: normalized lowercased string.
export const normalizeText = (s) =>
  String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Extracts readable header text from a header element. Input: header element. Output: string.
export function getHeaderText(headerEl) {
  if (!headerEl) return "";

  const button = headerEl.querySelector("button[title]");
  if (button) return (button.getAttribute("title") || "").trim();

  return (headerEl.textContent || "").trim();
}

// Extracts the Workday header key from a header element. Input: element. Output: string or null.
function getHeaderKey(el) {
  const a = el?.getAttribute?.("data-automation-id") || "";
  const m = a.match(/^columnHeader(\d+\.\d+)$/);
  return m ? m[1] : null;
}

// Builds header maps for a Workday grid. Input: grid root element. Output: { colMap, posMap }.
export function buildHeaderMaps(gridRoot) {
  const headerEls = Array.from(gridRoot.querySelectorAll('th[data-automation-id^="columnHeader"]'));

  debug.log({ id: "buildHeaderMaps.headers" }, "Header elements found:", headerEls);

  const headers = headerEls
    .map((el, pos) => {
      const text = getHeaderText(el);
      const key = getHeaderKey(el);
      return { el, pos, key, text, norm: normalizeText(text) };
    })
    .filter((h) => h.text);

  debug.log(
    { id: "buildHeaderMaps.parsedHeaders" },
    "Parsed headers:",
    headers.map((h) => ({ pos: h.pos, key: h.key, text: h.text, norm: h.norm })),
  );

  function findHeader(needles) {
    const ns = needles.map(normalizeText);
    let hit = headers.find((h) => ns.includes(h.norm));
    if (hit) return hit;
    hit = headers.find((h) => ns.some((n) => h.norm.includes(n)));
    return hit || null;
  }

  const KEYS = {
    instructor: ["instructor", "instructors"],
    meeting: ["meeting patterns", "meeting pattern"],
    deliveryMode: ["delivery mode"],
    title: ["title", "course listing"],
    section: ["section"],
    instructionalFormat: ["instructional format"],
    startDate: ["start date", "start"],
  };

  const colMap = {};
  const posMap = {};

  for (const [key, needles] of Object.entries(KEYS)) {
    const hit = findHeader(needles);
    colMap[key] = hit ? hit.key : null;
    posMap[key] = hit ? hit.pos : -1;

    debug.log({ id: "buildHeaderMaps.map" }, "Mapped header:", {
      key,
      needles,
      hit: hit ? { pos: hit.pos, colKey: hit.key, text: hit.text } : null,
    });
  }

  return { colMap, posMap };
}

const GRID_ROOT_SELECTOR = `
  table,
  [role="table"],
  [role="grid"],
  div[data-automation-id*="grid"],
  div[data-automation-id*="Grid"],
  div[data-automation-id="gridContainer"],
  div[data-automation-id="responsiveDataTable"],
  div[data-automation-id="tableContainer"]
`;

const GRID_HEADER_SELECTOR = `
  thead th,
  [role="columnheader"],
  div[data-automation-id*="columnHeader"],
  .wd-GridHeaderCell,
  .grid-column-header
`;

const GRID_ROW_SELECTOR = "tbody tr, [role='rowgroup'] [role='row'], .wd-GridRow, .grid-row";

function sameRows(leftRows, rightRows) {
  if (leftRows.length !== rightRows.length) return false;
  return leftRows.every((row, index) => row === rightRows[index]);
}

function getCandidateRoots() {
  const uniqueRoots = [];

  for (const root of $$(document, GRID_ROOT_SELECTOR)) {
    if (!(root instanceof Element)) continue;
    if (uniqueRoots.includes(root)) continue;
    uniqueRoots.push(root);
  }

  return uniqueRoots;
}

function scanRoot(root) {
  const headerEls = $$(root, GRID_HEADER_SELECTOR);
  const headerText = headerEls.map((h) => normalizeText(getHeaderText(h)));

  const looksRight =
    headerText.some((t) => t.includes("section")) &&
    (headerText.some((t) => t.includes("instructor")) ||
      headerText.some((t) => t.includes("meeting")) ||
      headerText.some((t) => t.includes("instructional format")) ||
      headerText.some((t) => t.includes("format")) ||
      headerText.some((t) => t.includes("status")));

  debug.log({ id: "findWorkdayGrid.scanRoot" }, "Scanning root:", { headerEls, looksRight, headerText });

  if (!looksRight) return null;

  const rows = $$(root, GRID_ROW_SELECTOR);

  debug.log({ id: "findWorkdayGrid.rows" }, "Rows found for matching root:", rows);

  if (!rows.length) return null;

  return { root, rows };
}

// Finds all Workday grid roots and rows that look like schedules. Input: none. Output: array of { root, rows }.
export function findWorkdayGrids() {
  const roots = getCandidateRoots();
  const matches = [];

  debug.log({ id: "findWorkdayGrid.roots" }, "Candidate roots found:", roots);

  for (const root of roots) {
    const match = scanRoot(root);
    if (!match) continue;
    if (matches.some((existing) => sameRows(existing.rows, match.rows))) continue;
    matches.push(match);
  }

  if (!matches.length) debug.log({ id: "findWorkdayGrid.none" }, "No matching table/grid found");

  return matches;
}

// Finds the first Workday grid root and rows. Input: none. Output: { root, rows } or null.
export function findWorkdayGrid() {
  return findWorkdayGrids()[0] || null;
}
