import { on } from "../utilities/dom.js";
import { debugFor, debugLog } from "../utilities/debugTool.js";
import {
  applyCourseColorAssignments,
  assignCourseColors,
  captureCourseColorPalettes,
  COURSE_COLOR_COUNT,
  COURSE_COLOR_LABELS,
  DEFAULT_COURSE_COLOR_ASSIGNMENTS,
  loadCourseColorAssignments,
  normalizeCourseColorAssignments,
  persistCourseColorAssignments,
} from "./courseColorSettings.js";

const debug = debugFor("courseColorController");
debugLog({ local: { courseColorController: false } });

// Creates the course color UI controller. Input: ui object. Output: controller object.
export async function createCourseColorController(ui) {
  debug.log({ id: "createCourseColorController.start" }, "Initializing course color controller");
  const courseColorTarget = ui.root?.host || ui.mainPanel;
  const courseColorPalettes = captureCourseColorPalettes(courseColorTarget);
  let courseColorAssignments = await loadCourseColorAssignments();

  if (courseColorTarget && courseColorPalettes.length) {
    courseColorAssignments = normalizeCourseColorAssignments(courseColorAssignments);
    applyCourseColorAssignments(courseColorTarget, courseColorPalettes, courseColorAssignments);
    debug.log(
      { id: "createCourseColorController.initialApply" },
      "Applied initial course color assignments",
      { assignments: courseColorAssignments },
    );
  }

  const renderCourseColorSettings = () => {
    if (!ui.courseColorGrid || !courseColorPalettes.length) {
      debug.log({ id: "createCourseColorController.render.skip" }, "Skipped rendering course color settings");
      return;
    }
    ui.courseColorGrid.innerHTML = "";
    debug.log({ id: "createCourseColorController.render" }, "Rendering course color settings", {
      paletteCount: courseColorPalettes.length,
    });

    const paletteById = new Map(courseColorPalettes.map((palette) => [palette.id, palette]));

    for (let index = 0; index < COURSE_COLOR_COUNT; index += 1) {
      const courseIndex = index + 1;
      const row = document.createElement("div");
      row.className = "course-color-row";

      const label = document.createElement("div");
      label.className = "course-color-label";
      label.textContent = `Course ${courseIndex}`;

      const control = document.createElement("div");
      control.className = "course-color-control";

      const select = document.createElement("select");
      select.className = "course-color-select";
      select.dataset.courseColor = String(courseIndex);

      courseColorPalettes.forEach((palette, paletteIndex) => {
        const option = document.createElement("option");
        option.value = String(palette.id);
        option.textContent = COURSE_COLOR_LABELS[paletteIndex] || palette.label || `Palette ${palette.id}`;
        if (palette.id === courseColorAssignments[index]) option.selected = true;
        select.appendChild(option);
      });

      const swatch = document.createElement("div");
      swatch.className = "course-color-swatch";

      const updateSwatch = (paletteId) => {
        const palette = paletteById.get(paletteId);
        if (!palette) return;
        swatch.style.background = palette.bg;
        swatch.style.borderColor = palette.border;
      };

      updateSwatch(courseColorAssignments[index]);

      on(select, "change", async () => {
        const paletteId = Number(select.value);
        debug.log({ id: "createCourseColorController.change" }, "Course color selection changed", {
          courseIndex,
          paletteId,
        });
        courseColorAssignments[index] = paletteId;
        courseColorAssignments = normalizeCourseColorAssignments(courseColorAssignments);
        applyCourseColorAssignments(courseColorTarget, courseColorPalettes, courseColorAssignments);
        updateSwatch(paletteId);
        await persistCourseColorAssignments(courseColorAssignments);
      });

      control.appendChild(select);
      control.appendChild(swatch);
      row.appendChild(label);
      row.appendChild(control);
      ui.courseColorGrid.appendChild(row);
    }
  };

  const applyAndPersistCourseColors = async (assignments, { skipPersist = false } = {}) => {
    debug.log({ id: "createCourseColorController.applyAndPersist" }, "Applying course colors", {
      assignments,
      skipPersist,
    });
    courseColorAssignments = normalizeCourseColorAssignments(assignments);
    applyCourseColorAssignments(courseColorTarget, courseColorPalettes, courseColorAssignments);
    renderCourseColorSettings();
    if (!skipPersist) await persistCourseColorAssignments(courseColorAssignments);
  };

  renderCourseColorSettings();

  if (ui.courseColorReset) {
    on(ui.courseColorReset, "click", async () => {
      await applyAndPersistCourseColors(DEFAULT_COURSE_COLOR_ASSIGNMENTS);
    });
  }

  return {
    assignCourseColors,
    applyAndPersistCourseColors,
    getAssignments: () => {
      debug.log({ id: "createCourseColorController.getAssignments" }, "Reading course color assignments", {
        assignments: courseColorAssignments,
      });
      return [...courseColorAssignments];
    },
  };
}
