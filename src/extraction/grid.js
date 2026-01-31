import { $$ } from "../utilities/dom";
import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("grid");

export const normalizeText = (s) =>
  String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function getHeaderText(headerEl) {
  if (!headerEl) return "";

  const btn = headerEl.querySelector("button[title]");
  if (btn) return (btn.getAttribute("title") || "").trim();

  return (headerEl.textContent || "").trim();
}

function getHeaderKey(el) {
  const a = el?.getAttribute?.("data-automation-id") || "";
  const m = a.match(/^columnHeader(\d+\.\d+)$/);
  return m ? m[1] : null; // "252.9"
}

export function buildHeaderMaps(gridRoot) {
  const headerEls = Array.from(gridRoot.querySelectorAll('th[data-automation-id^="columnHeader"]'));

  debug.log({ id: "buildHeaderMaps.headers" }, "Header elements found:", headerEls.length);

  const headers = headerEls
    .map((el, pos) => {
      const text = getHeaderText(el);
      const key = getHeaderKey(el); // "252.9"
      return { el, pos, key, text, norm: normalizeText(text) };
    })
    .filter((h) => h.text);

  debug.log(
    { id: "buildHeaderMaps.parsedHeaders" },
    "Parsed headers:",
    headers.map((h) => ({ pos: h.pos, key: h.key, text: h.text, norm: h.norm }))
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
    colMap[key] = hit ? hit.key : null; // store "252.9"
    posMap[key] = hit ? hit.pos : -1;

    debug.log({ id: "buildHeaderMaps.map" }, "Mapped header:", {
      key,
      needles,
      hit: hit ? { pos: hit.pos, colKey: hit.key, text: hit.text } : null,
    });
  }

  return { colMap, posMap };
}

export function findWorkdayGrid() {
  const roots = $$(
    document,
    `
  table,
  [role="table"],
  [role="grid"],
  div[data-automation-id*="grid"],
  div[data-automation-id*="Grid"],
  div[data-automation-id="gridContainer"],
  div[data-automation-id="responsiveDataTable"],
  div[data-automation-id="tableContainer"]
`
  );

  debug.log({ id: "findWorkdayGrid.roots" }, "Candidate roots found:", roots.length);

  for (const root of roots) {
    const headerEls = $$(
      root,
      `
  thead th,
  [role="columnheader"],
  div[data-automation-id*="columnHeader"],
  .wd-GridHeaderCell,
  .grid-column-header
`
    );

    const headerText = headerEls.map((h) => normalizeText(getHeaderText(h)));

    const looksRight =
      headerText.some((t) => t.includes("section")) &&
      (headerText.some((t) => t.includes("instructor")) ||
        headerText.some((t) => t.includes("meeting")) ||
        headerText.some((t) => t.includes("instructional format")) ||
        headerText.some((t) => t.includes("format")) ||
        headerText.some((t) => t.includes("status")));

    debug.log({ id: "findWorkdayGrid.scanRoot" }, "Scanning root:", {
      headerCount: headerEls.length,
      looksRight,
      headerText,
    });

    if (!looksRight) continue;

    const rows = $$(root, "tbody tr, [role='rowgroup'] [role='row'], .wd-GridRow, .grid-row");

    debug.log({ id: "findWorkdayGrid.rows" }, "Rows found for matching root:", rows.length);

    if (rows.length) return { root, rows };
  }

  debug.log({ id: "findWorkdayGrid.none" }, "No matching table/grid found");
  return null;
}
