import { debugFor } from "../../utilities/debugTool.js";

const debug = debugFor("instructorInfo");

export function extractInstructorNamesFromCell(instructorEl) {
  if (!instructorEl) {
    debug.log({ id: "extractInstructorNamesFromCell.missing" }, "No instructor element provided");
    return "";
  }

  const prompt = instructorEl.querySelector('[data-automation-id="promptOption"]');
  const txt = (
    (prompt && (prompt.getAttribute("data-automation-label") || prompt.getAttribute("title") || prompt.textContent)) ||
    instructorEl.textContent ||
    ""
  ).trim();

  debug.log({ id: "extractInstructorNamesFromCell.result" }, "Extracted instructor text:", {
    hasPrompt: !!prompt,
    txt,
  });

  return txt;
}
