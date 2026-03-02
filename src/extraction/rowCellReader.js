import { $$ } from "../utilities/dom";
import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("rowCellReader");

// Extracts the Workday column key from a cell. Input: cell element. Output: key string or null.
function getCellWorkdayKey(cell) {
  const inner = cell.querySelector('[id^="gen-dwr-comp-"]');
  const id = inner?.id || "";
  const m = id.match(/^gen-dwr-comp-(\d+\.\d+)-/);
  return m ? m[1] : null;
}

// Creates helpers to read row cells by header key. Input: row element and header maps. Output: reader object.
export function createRowCellReader(rowEl, headerMaps) {
  const { colMap: colHeaderMap } = headerMaps || {};

  const cellsInRow = $$(rowEl, "td, [role='gridcell']");

  debug.log({ id: "createRowCellReader.start" }, "Creating row cell reader:", cellsInRow);

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
