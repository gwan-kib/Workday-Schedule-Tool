import { on } from "../utilities/dom.js";
import { debugFor, debugLog } from "../utilities/debugTool.js";

const debug = debugFor("scheduleModals");
debugLog({ local: { scheduleModals: false } });

// Creates the save/delete schedule modal controller. Input: ui object. Output: controller object.
export function createScheduleModalController(ui) {
  debug.log({ id: "createScheduleModalController.start" }, "Initializing schedule modal controller");
  let resolveScheduleModal = null;

  const closeScheduleModal = (value) => {
    if (!ui.saveModal) return;
    debug.log({ id: "createScheduleModalController.close" }, "Closing schedule modal", { value });

    ui.saveModal.classList.add("is-hidden");
    ui.saveModal.setAttribute("aria-hidden", "true");

    if (resolveScheduleModal) {
      resolveScheduleModal(value);
      resolveScheduleModal = null;
    }
  };

  const openScheduleModal = ({ title, message, confirmLabel = "Save", showInput = true, showCancel = true }) => {
    if (!ui.saveModal) return Promise.resolve(null);
    debug.log({ id: "createScheduleModalController.open" }, "Opening schedule modal", {
      title,
      showInput,
      showCancel,
      confirmLabel,
    });

    ui.saveModalTitle.textContent = title;
    ui.saveModalMessage.textContent = message;
    ui.saveModalConfirm.textContent = confirmLabel;

    ui.saveModalField.classList.toggle("is-hidden", !showInput);
    ui.saveModalCancel.classList.toggle("is-hidden", !showCancel);

    ui.saveModalInput.value = "";
    ui.saveModalInput.classList.remove("is-invalid");

    ui.saveModal.classList.remove("is-hidden");
    ui.saveModal.setAttribute("aria-hidden", "false");

    if (showInput) ui.saveModalInput.focus();
    else ui.saveModalConfirm.focus();

    return new Promise((resolve) => {
      resolveScheduleModal = resolve;
    });
  };

  if (ui.saveModal) {
    on(ui.saveModal, "click", (event) => {
      if (event.target === ui.saveModal) return closeScheduleModal(null);

      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;

      if (action === "close" || action === "cancel") return closeScheduleModal(null);

      if (action === "confirm") {
        debug.log({ id: "createScheduleModalController.confirm" }, "Confirm clicked in schedule modal");
        const needsInput = !ui.saveModalField.classList.contains("is-hidden");
        if (needsInput) {
          const value = ui.saveModalInput.value.trim();
          if (!value) {
            debug.warn({ id: "createScheduleModalController.validation" }, "Schedule modal input was empty");
            ui.saveModalInput.classList.add("is-invalid");
            ui.saveModalInput.focus();
            return;
          }
          return closeScheduleModal(value);
        }
        return closeScheduleModal(true);
      }
    });

    on(ui.saveModalInput, "input", () => ui.saveModalInput.classList.remove("is-invalid"));
    on(ui.saveModalInput, "keydown", (event) => {
      if (event.key === "Enter") ui.saveModalConfirm.click();
    });

    on(document, "keydown", (event) => {
      if (event.key === "Escape" && !ui.saveModal.classList.contains("is-hidden")) closeScheduleModal(null);
    });
  }

  return {
    closeScheduleModal,
    openScheduleModal,
  };
}

// Creates the schedule picker modal controller. Input: ui object. Output: controller object.
export function createSchedulePickerController(ui) {
  debug.log({ id: "createSchedulePickerController.start" }, "Initializing schedule picker controller");
  let resolveSchedulePickerModal = null;

  const closeSchedulePickerModal = (value) => {
    if (!ui.schedulePickerModal) return;
    debug.log({ id: "createSchedulePickerController.close" }, "Closing schedule picker modal", { value });

    ui.schedulePickerModal.classList.add("is-hidden");
    ui.schedulePickerModal.setAttribute("aria-hidden", "true");
    ui.schedulePickerList.innerHTML = "";

    if (resolveSchedulePickerModal) {
      resolveSchedulePickerModal(value);
      resolveSchedulePickerModal = null;
    }
  };

  const renderSchedulePickerOptions = (options) => {
    if (!ui.schedulePickerList) return;
    debug.log({ id: "createSchedulePickerController.renderOptions" }, "Rendering schedule picker options", {
      optionCount: options.length,
    });

    ui.schedulePickerList.innerHTML = "";

    options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "schedule-picker-option";
      button.dataset.scheduleId = option.id;

      const title = document.createElement("span");
      title.className = "schedule-picker-option-title";
      title.textContent = option.title;

      const meta = document.createElement("span");
      meta.className = "schedule-picker-option-meta";
      meta.textContent = `${option.courseCount} course${option.courseCount === 1 ? "" : "s"}`;

      const courses = document.createElement("span");
      courses.className = "schedule-picker-option-courses";
      courses.textContent = option.courseNames.length ? option.courseNames.join(", ") : "No course names detected";

      button.appendChild(title);
      button.appendChild(meta);
      button.appendChild(courses);
      ui.schedulePickerList.appendChild(button);
    });
  };

  const openSchedulePickerModal = ({
    title = "Choose a schedule",
    message = "Multiple schedule tables were found on this page. Choose which one to load.",
    options = [],
  }) => {
    if (!ui.schedulePickerModal || !ui.schedulePickerList) return Promise.resolve(options[0]?.id || null);
    debug.log({ id: "createSchedulePickerController.open" }, "Opening schedule picker modal", {
      title,
      optionCount: options.length,
    });

    ui.schedulePickerTitle.textContent = title;
    ui.schedulePickerMessage.textContent = message;
    renderSchedulePickerOptions(options);

    ui.schedulePickerModal.classList.remove("is-hidden");
    ui.schedulePickerModal.setAttribute("aria-hidden", "false");

    const firstOption = ui.schedulePickerList.querySelector(".schedule-picker-option");
    if (firstOption) firstOption.focus();
    else ui.schedulePickerCancel?.focus();

    return new Promise((resolve) => {
      resolveSchedulePickerModal = resolve;
    });
  };

  if (ui.schedulePickerModal) {
    on(ui.schedulePickerModal, "click", (event) => {
      if (event.target === ui.schedulePickerModal) return closeSchedulePickerModal(null);

      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action === "close" || action === "cancel") return closeSchedulePickerModal(null);

      const option = event.target.closest("[data-schedule-id]");
      if (option) return closeSchedulePickerModal(option.dataset.scheduleId);
    });

    on(document, "keydown", (event) => {
      if (event.key === "Escape" && !ui.schedulePickerModal.classList.contains("is-hidden")) {
        closeSchedulePickerModal(null);
      }
    });
  }

  return {
    closeSchedulePickerModal,
    openSchedulePickerModal,
  };
}
