import { debugFor, debugLog } from "../../utilities/debugTool.js";
import {
  assignCourseColors,
  assignManualCourseGroupColor,
  captureCourseColorPalettes,
} from "./courseColorSettings.js";

const debug = debugFor("courseColorController");
debugLog({ local: { courseColorController: false } });

// Creates the course color controller. Input: ui object. Output: controller object.
export async function createCourseColorController(ui) {
  debug.log({ id: "createCourseColorController.start" }, "Initializing course color controller");
  const courseColorTarget = ui.root?.host || ui.mainPanel;
  const courseColorPalettes = captureCourseColorPalettes(courseColorTarget);

  return {
    assignCourseColors,
    assignManualCourseGroupColor,
    getPalettes: () => [...courseColorPalettes],
  };
}
