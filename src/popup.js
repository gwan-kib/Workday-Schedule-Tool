import {
  applyCourseColorAssignments,
  captureCourseColorPalettes,
  normalizeCourseColorAssignments,
} from "./mainPanel/settings/courseColorSettings.js";
import { renderSchedule } from "./mainPanel/schedules/scheduleView.js";
import {
  formatScheduleMeta,
  getPreferredSchedule,
  loadSavedSchedules,
  persistSavedSchedules,
  togglePreferredSchedule,
} from "./mainPanel/schedules/scheduleStorage.js";
import { createFooterNoteController } from "./mainPanel/shell/footerNoteController.js";

// Cache the popup's small set of DOM nodes once so render helpers can stay focused on state updates.
const ui = {
  empty: document.querySelector("#popup-empty"),
  content: document.querySelector("#popup-content"),
  pickerWrap: document.querySelector("#popup-picker-wrap"),
  savedDropdown: document.querySelector("#popup-saved-dropdown"),
  savedSummaryText: document.querySelector("#popup-saved-summary-text"),
  savedMenu: document.querySelector("#popup-saved-menu"),
  meta: document.querySelector("#popup-meta"),
  scheduleGrid: document.querySelector("#popup-schedule-grid"),
  scheduleTermPill: document.querySelector("#popup-term-pill"),
  footerAlert: document.querySelector("#popup-footer-alert"),
};

ui.footerNotes = createFooterNoteController(ui.footerAlert);

// Popup state mirrors the saved schedules in storage plus the schedule currently being previewed.
const popupState = {
  schedules: [],
  activeScheduleId: null,
  basePalettes: [],
  timeFormat: "am/pm",
};
let scheduledRenderFrame = 0;

// Reapplies the stored course color palette so the popup preview matches the main extension view.
function applySavedPalette(schedule) {
  if (!popupState.basePalettes.length) return;

  applyCourseColorAssignments(
    document.documentElement,
    popupState.basePalettes,
    normalizeCourseColorAssignments(schedule?.colorAssignments),
  );
}

function cancelScheduledRender() {
  if (!scheduledRenderFrame) return;
  cancelAnimationFrame(scheduledRenderFrame);
  scheduledRenderFrame = 0;
}

// The schedule renderer depends on live element measurements, so defer until the popup is visible.
function queueVisibleScheduleRender(schedule) {
  cancelScheduledRender();

  scheduledRenderFrame = requestAnimationFrame(() => {
    scheduledRenderFrame = requestAnimationFrame(() => {
      scheduledRenderFrame = 0;
      renderSchedule(ui, schedule?.courses, null, popupState.timeFormat);
      wireTimeFormatToggle(schedule);
    });
  });
}

function wireTimeFormatToggle(schedule) {
  const toggleButton = ui.scheduleGrid?.querySelector(".schedule-time-toggle");
  if (!toggleButton) return;

  toggleButton.textContent = popupState.timeFormat === "am/pm" ? "AM/PM" : "24H";
  toggleButton.setAttribute("aria-pressed", String(popupState.timeFormat === "am/pm"));
  toggleButton.addEventListener("click", () => {
    popupState.timeFormat = popupState.timeFormat === "am/pm" ? "24h" : "am/pm";
    queueVisibleScheduleRender(schedule);
  });
}

// The popup reuses the main extension's saved-schedules dropdown pattern so the picker feels consistent.
function renderPicker() {
  if (!ui.savedMenu || !ui.savedSummaryText) return;

  const activeSchedule =
    popupState.schedules.find((schedule) => schedule.id === popupState.activeScheduleId) ||
    getPreferredSchedule(popupState.schedules);

  ui.savedSummaryText.textContent = activeSchedule?.name || "Schedules";
  ui.savedMenu.innerHTML = "";

  popupState.schedules.forEach((schedule) => {
    const card = document.createElement("div");
    card.className = `schedule-saved-card${schedule.id === popupState.activeScheduleId ? " is-active" : ""}`;
    card.dataset.id = schedule.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const header = document.createElement("div");
    header.className = "schedule-saved-card-header";

    const info = document.createElement("div");
    const title = document.createElement("div");
    title.className = "schedule-saved-title";
    title.textContent = schedule.name;

    const titleRow = document.createElement("div");
    titleRow.className = "schedule-saved-title-row";
    titleRow.appendChild(title);

    if (schedule.isFavorite) {
      const badge = document.createElement("span");
      badge.className = "schedule-saved-badge";
      badge.textContent = "Favorite";
      titleRow.appendChild(badge);
    }

    const meta = document.createElement("div");
    meta.className = "schedule-saved-meta";
    meta.textContent = formatScheduleMeta(schedule);

    info.appendChild(titleRow);
    info.appendChild(meta);
    header.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "schedule-saved-actions";

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = `schedule-saved-action star wd-hover-tooltip${schedule.isFavorite ? " is-favorite" : ""}`;
    favoriteButton.dataset.action = "favorite";
    const favoriteLabel = schedule.isFavorite ? "Unstar schedule" : "Star schedule";
    favoriteButton.dataset.tooltip = favoriteLabel;
    favoriteButton.setAttribute("aria-label", favoriteLabel);
    favoriteButton.setAttribute("aria-pressed", String(schedule.isFavorite));

    const favoriteIcon = document.createElement("span");
    favoriteIcon.className = "material-symbols-rounded";
    favoriteIcon.setAttribute("aria-hidden", "true");
    favoriteIcon.textContent = "star";
    favoriteButton.appendChild(favoriteIcon);

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "schedule-saved-action rename wd-hover-tooltip";
    renameButton.dataset.action = "rename";
    renameButton.dataset.tooltip = "Rename schedule";
    renameButton.setAttribute("aria-label", "Rename schedule");

    const renameIcon = document.createElement("span");
    renameIcon.className = "material-symbols-rounded";
    renameIcon.setAttribute("aria-hidden", "true");
    renameIcon.textContent = "edit";
    renameButton.appendChild(renameIcon);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "schedule-saved-action delete wd-hover-tooltip";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.tooltip = "Delete schedule";
    deleteButton.setAttribute("aria-label", "Delete schedule");

    const deleteIcon = document.createElement("span");
    deleteIcon.className = "material-symbols-rounded";
    deleteIcon.setAttribute("aria-hidden", "true");
    deleteIcon.textContent = "delete";
    deleteButton.appendChild(deleteIcon);

    actions.appendChild(favoriteButton);
    actions.appendChild(renameButton);
    actions.appendChild(deleteButton);
    card.appendChild(header);
    card.appendChild(actions);
    ui.savedMenu.appendChild(card);
  });

  ui.pickerWrap?.classList.toggle("is-hidden", popupState.schedules.length <= 1);
}

// Renders the active saved schedule preview, falling back to the preferred schedule when needed.
function renderActiveSchedule() {
  const activeSchedule =
    popupState.schedules.find((schedule) => schedule.id === popupState.activeScheduleId) ||
    getPreferredSchedule(popupState.schedules);

  if (!activeSchedule) {
    cancelScheduledRender();
    ui.empty?.classList.remove("is-hidden");
    ui.content?.classList.add("is-hidden");
    return;
  }

  popupState.activeScheduleId = activeSchedule.id;
  renderPicker();
  applySavedPalette(activeSchedule);

  ui.empty?.classList.add("is-hidden");
  ui.content?.classList.remove("is-hidden");
  ui.meta.textContent = formatScheduleMeta(activeSchedule);

  queueVisibleScheduleRender(activeSchedule);
}

// Startup restores saved schedules from storage, captures the base theme palette, and draws the initial preview.
async function boot() {
  popupState.basePalettes = captureCourseColorPalettes(document.documentElement);
  popupState.schedules = await loadSavedSchedules();
  popupState.activeScheduleId = getPreferredSchedule(popupState.schedules)?.id || null;

  renderPicker();
  renderActiveSchedule();
}

ui.savedMenu?.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-action]");
  const card = event.target.closest(".schedule-saved-card");
  const scheduleId = card?.dataset.id;
  if (!scheduleId) return;

  if (actionButton?.dataset.action === "favorite") {
    event.stopPropagation();
    popupState.schedules = togglePreferredSchedule(popupState.schedules, scheduleId);
    await persistSavedSchedules(popupState.schedules);
    renderPicker();
    if (ui.savedDropdown) ui.savedDropdown.open = true;
    return;
  }

  if (actionButton?.dataset.action === "rename") {
    event.stopPropagation();
    const selected = popupState.schedules.find((schedule) => schedule.id === scheduleId);
    if (!selected) return;

    const promptedName = window.prompt("Rename schedule", selected.name);
    if (promptedName === null) return;

    const nextName = promptedName.trim();
    if (!nextName) {
      ui.footerNotes?.showTemporary("Schedule name cannot be empty.", { tone: "warn" });
      if (ui.savedDropdown) ui.savedDropdown.open = true;
      return;
    }

    if (nextName === selected.name) {
      if (ui.savedDropdown) ui.savedDropdown.open = true;
      return;
    }

    popupState.schedules = popupState.schedules.map((schedule) =>
      schedule.id === scheduleId ? { ...schedule, name: nextName } : schedule,
    );

    await persistSavedSchedules(popupState.schedules);
    renderPicker();
    renderActiveSchedule();
    ui.footerNotes?.showTemporary(`Renamed schedule to "${nextName}".`, { tone: "success" });
    if (ui.savedDropdown) ui.savedDropdown.open = true;
    return;
  }

  if (actionButton?.dataset.action === "delete") {
    event.stopPropagation();
    const selected = popupState.schedules.find((schedule) => schedule.id === scheduleId);
    if (!selected) return;

    const confirmed = window.confirm(`Delete "${selected.name}"? This cannot be undone.`);
    if (!confirmed) return;

    popupState.schedules = popupState.schedules.filter((schedule) => schedule.id !== scheduleId);

    if (popupState.activeScheduleId === scheduleId) {
      popupState.activeScheduleId = getPreferredSchedule(popupState.schedules)?.id || null;
    }

    await persistSavedSchedules(popupState.schedules);
    renderPicker();
    renderActiveSchedule();
    if (ui.savedDropdown && popupState.schedules.length > 1) ui.savedDropdown.open = true;
    return;
  }

  popupState.activeScheduleId = scheduleId;
  if (ui.savedDropdown) ui.savedDropdown.open = false;
  renderActiveSchedule();
});

ui.savedMenu?.addEventListener("keydown", (event) => {
  const card = event.target.closest(".schedule-saved-card");
  if (!card) return;

  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.target.closest("[data-action]")) return;

  event.preventDefault();
  card.click();
});

document.addEventListener("click", (event) => {
  const path = event.composedPath ? event.composedPath() : [];
  if (ui.savedDropdown?.open && !path.includes(ui.savedDropdown)) {
    ui.savedDropdown.open = false;
  }
});

// The schedule grid uses measured layout, so rerender on resize to keep the preview aligned.
window.addEventListener("resize", () => {
  if (!popupState.activeScheduleId) return;
  renderActiveSchedule();
});

void boot();
