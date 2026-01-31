import { debugFor } from "../../utilities/debugTool";

const debug = debugFor("sectionLinkInfo");

export function parseSectionLinkString(input) {
  let str = String(input || "")
    .replace(/\u00A0/g, " ")
    .trim();

  debug.log({ id: "parseSectionLinkString.input" }, "Raw input:", input);

  if (!str) return null;

  // keep ALL lines; Workday wraps titles with \n
  str = str.replace(/\s*\n\s*/g, " ").trim();

  debug.log({ id: "parseSectionLinkString.normalized" }, "Normalized string:", str);

  const m = str.match(/^\s*([A-Z][A-Z0-9_]*\s*\d{3}[A-Z]?)\s*-\s*(.+?)\s*$/);
  if (!m) {
    debug.log({ id: "parseSectionLinkString.noMatch" }, "String did not match expected pattern");
    return null;
  }

  const baseCode = m[1].trim(); // "COSC_O 222"
  const rest = m[2].trim(); // "L2D - Data Structures" or "101 - Data Structures"

  debug.log({ id: "parseSectionLinkString.match" }, "Regex match:", { baseCode, rest });

  const parts = rest
    .split(/\s*[-–—]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  let sectionToken = "";
  let parsedTitle = "";

  sectionToken = parts[0];
  parsedTitle = parts.slice(1).join(" - ").trim();

  parsedTitle = parsedTitle.replace(/\s*:\s*/g, ":\n");

  const result = {
    code: baseCode,
    section_number: sectionToken,
    title: parsedTitle,
    full: str,
  };

  debug.log({ id: "parseSectionLinkString.result" }, "Parsed section link result:", result);

  return result;
}
