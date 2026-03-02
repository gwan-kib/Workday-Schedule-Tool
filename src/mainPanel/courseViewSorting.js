import { $$, on } from "../utilities/dom.js";
import { STATE } from "../core/state.js";
import { renderCourseRows } from "./renderCourseRows.js";
import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("mainPanelInteractions");

// Filters courses into STATE.filtered by query. Input: query string. Output: none.
export function filterCourses(query) {
  const q = (query || "").trim().toLowerCase();

  if (!q) {
    STATE.filtered = [...STATE.courses];
    return;
  }

  const keys = ["code", "title", "section_number", "instructor", "meeting", "instructionalFormat"];

  STATE.filtered = STATE.courses.filter((c) =>
    keys.some((k) =>
      String(c?.[k] || "")
        .toLowerCase()
        .includes(q)
    )
  );
}

// Sorts STATE.filtered by a key and updates STATE.sort. Input: key string. Output: none.
export function sortCourses(key) {
  if (!key) return;

  const dir = STATE.sort.key === key ? -STATE.sort.dir : 1;
  STATE.sort = { key, dir };

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  STATE.filtered.sort((a, b) => dir * collator.compare(a?.[key] || "", b?.[key] || ""));
}

// Wires sorting handlers to sort buttons. Input: ui object. Output: none.
export function wireTableSorting(ui) {
  const headCells = $$(ui.tableHead, "[data-key]");

  headCells.forEach((th) => {
    on(th, "click", () => {
      const key = th.getAttribute("data-key");
      const isSameKey = STATE.sort.key === key;
      const isDesc = isSameKey && STATE.sort.dir === -1;

      if (isDesc) {
        // Third click: clear sorting and restore filtered order.
        STATE.sort = { key: null, dir: 1 };
        filterCourses(ui.searchInput?.value || "");
        renderCourseRows(ui, STATE.filtered);

        headCells.forEach((h) => h.classList.remove("sorted-asc", "sorted-desc"));
        debug.log({ id: "wireTableSorting.click" }, "Cleared sort via list controls", { key });
        return;
      }

      sortCourses(key);
      renderCourseRows(ui, STATE.filtered);

      headCells.forEach((h) => h.classList.remove("sorted-asc", "sorted-desc"));
      th.classList.add(STATE.sort.dir === 1 ? "sorted-asc" : "sorted-desc");

      debug.log({ id: "wireTableSorting.click" }, "Sorted via list controls", { key, dir: STATE.sort.dir });
    });
  });
}
