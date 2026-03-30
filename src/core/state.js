export const STATE = {
  courses: [],

  filtered: [],

  savedSchedules: [],

  currentSavedScheduleId: null,

  currentScheduleName: null,

  sort: { key: null, dir: 1 },

  view: {
    panel: "course-list-panel",
    lastMainPanel: "course-list-panel",
    semester: null,
    timeFormat: "am/pm",
    hoverTipsEnabled: true,
  },
};
