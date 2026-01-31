import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("state");

export const STATE = {
  // list of courses extracted from workday
  courses: [],

  // list of filtered courses, used for searching and sorting
  filtered: [],

  // list of user saved schedules
  savedSchedules: [],

  // name of the currently loaded schedule (if any)
  currentScheduleName: null,

  // tracks current sorting state, key: field name, dir: 1 ascending, -1 descending eg. STATE.sort = { key: "startTime", dir: -1 };
  sort: { key: null, dir: 1 },

  // tracks viewing state, panel: current extension page, semester: current semester tab
  view: {
    panel: "list",
    semester: "first",
  },

  setCourses(newCourses) {
    this.courses = newCourses;
    debug.log("Courses updated:", newCourses);
  },

  setFiltered(filteredCourses) {
    this.filtered = filteredCourses;
    debug.log("Filtered courses updated:", filteredCourses);
  },

  setSavedSchedules(saved) {
    this.savedSchedules = saved;
    debug.log("Saved schedules updated:", saved);
  },

  setSort(sortState) {
    this.sort = sortState;
    debug.log("Sorting state updated:", sortState);
  },

  setView(viewState) {
    this.view = viewState;
    debug.log("View state updated:", viewState);
  },
};
