import { $$ } from "../utilities/dom";
import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("rowCellReader");

// maps row cells to Workday keys (e.g., "252.9" from "<div id='gen-dwr-comp-252.9-...'>")
function getCellWorkdayKey(cell) {
  const inner = cell.querySelector('[id^="gen-dwr-comp-"]');
  const id = inner?.id || "";
  const m = id.match(/^gen-dwr-comp-(\d+\.\d+)-/);
  return m ? m[1] : null;
}

export function createRowCellReader(rowEl, headerMaps) {
  const { colMap: colHeaderMap } = headerMaps || {};

  const cellsInRow = $$(rowEl, "td, [role='gridcell']");

  debug.log({ id: "createRowCellReader.start" }, "Creating row cell reader:", {
    cellCount: cellsInRow.length,
  });

  const cellByCol = new Map();
  cellsInRow.forEach((cell) => {
    const key = getCellWorkdayKey(cell);
    if (key && !cellByCol.has(key)) cellByCol.set(key, cell);
  });

  const getCellByHeader = (keyName) => {
    const colKey = colHeaderMap?.[keyName];
    if (colKey == null) return null;
    return cellByCol.get(colKey) || null;
  };

  const readCellTextByHeader = (keyName) => {
    const el = getCellByHeader(keyName);
    return (el?.innerText || "").trim();
  };

  return {
    cellsInRow,
    cellByCol,
    getCellByHeader,
    readCellTextByHeader,
  };
}
