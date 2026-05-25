import { debugFor, debugLog } from "../../utilities/debugTool.js";
import { fetchSectionGradesWithFallback, readTermCampus, resolveCourseInfoForAverage } from "./gradesApiCall.js";
import { extractWorkdayCourseIdFromElement } from "../../extraction/singleCourseImport.js";

const registrationCardSelector = 'li[data-automation-id="compositeContainer"]';
const averageButtonSelector = registrationCardSelector;
const coursePromptSelector = '[data-automation-id="compositeHeader"] div.WPJO.WIIO[data-automation-id="promptOption"]';
const compositeSubHeaderSelector = '[data-automation-id="compositeSubHeaderOne"]';
const courseImportButtonSelector = ".registration__course-import-button";
const courseActionStackSelector = ".registration__course-actions";
const debug = debugFor("registrationAverageButtons");
debugLog({ local: { registrationAverageButtons: false } });

const extractAverage = (data) => {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const average = extractAverage(item);
      if (average != null) return average;
    }
    return null;
  }
  if (typeof data !== "object") return null;

  const direct =
    data.average ?? data.avg ?? data.average_grade ?? data.averagePercent ?? data.avgPercent ?? data.mean ?? null;
  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const nested = data?.grades?.average ?? data?.grades?.avg ?? data?.summary?.average ?? data?.summary?.avg ?? null;
  if (typeof nested === "number") return nested;
  if (typeof nested === "string" && nested.trim()) return nested.trim();

  return null;
};

const buildAverageLabel = (average) => {
  if (average == null) return "Average:\nN/A";
  if (typeof average === "number") return `Average:\n${average.toFixed(1)}%`;
  return `Average:\n${average}%`;
};

const hasValidAverage = (data) => extractAverage(data) != null;
const lectureLike = (text) => /\blecture\b/i.test(String(text || ""));
const labLike = (text) => /\b(laboratory)\b/i.test(String(text || ""));
const seminarLike = (text) => /\bseminar\b/i.test(String(text || ""));
const discussionLike = (text) => /\bdiscussion\b/i.test(String(text || ""));
const experientialLike = (text) => /\bexperiential\b/i.test(String(text || ""));
const isLectureFormat = (text) =>
  lectureLike(text) && !labLike(text) && !seminarLike(text) && !discussionLike(text) && !experientialLike(text);
const summarizeDebugText = (text, maxLength = 160) => {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};
const getRegistrationContainer = (headerWrapper) =>
  headerWrapper?.closest?.(registrationCardSelector) || headerWrapper || null;
const getStaticButtonLabel = (reason) => (reason === "not-lecture" ? "Not a lecture" : "Average:\nunavailable");
const hasAverageButton = (row) => Boolean(row?.querySelector?.(".registration__avg-button"));
const hasCourseImportButton = (row) => Boolean(row?.querySelector?.(courseImportButtonSelector));
const createMaterialIcon = (name) => {
  const icon = document.createElement("span");
  icon.className = "material-symbols-rounded";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = name;

  return icon;
};
const setAverageButtonContent = (button, text) => {
  const label = document.createElement("span");
  label.className = "registration__button-label";
  label.textContent = text;

  button.classList.add("registration__avg-button--with-icon");
  button.replaceChildren(createMaterialIcon("bar_chart"), label);
};
const setCourseImportButtonContent = (button) => {
  const label = document.createElement("span");
  label.className = "registration__button-label";
  label.textContent = "Add into extension";

  button.replaceChildren(createMaterialIcon("add_ad"), label);
};
const getCoursePromptOption = (row) =>
  row?.querySelector?.(coursePromptSelector) ||
  row?.querySelector?.('[data-automation-id="compositeHeader"] [data-automation-id="promptOption"]') ||
  null;

const getPromptLink = (promptOption) => {
  const hrefEl = promptOption?.closest?.("a[href]") || promptOption?.querySelector?.("a[href]");
  const href = hrefEl?.getAttribute?.("href") || promptOption?.getAttribute?.("href") || "";
  if (!href) return "";

  try {
    return new URL(href, window.location.href).href;
  } catch (error) {
    return "";
  }
};

// Sets up registration average/add-course buttons on Workday pages. Input: optional add-course handler. Output: cleanup function.
export function setupRegistrationAverageButtons({ onAddCourse } = {}) {
  debug.log({ id: "setupRegistrationAverageButtons.start" }, "Initializing registration average buttons");
  let termCampus = readTermCampus();

  const getButtonStack = (row) => {
    if (!row) return null;

    let stack = row.querySelector?.(courseActionStackSelector);
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "registration__course-actions";
      row.insertBefore(stack, row.firstElementChild);
    }

    const directAverageButton = Array.from(row.children || []).find((child) =>
      child.classList?.contains("registration__avg-button"),
    );
    if (directAverageButton) stack.insertBefore(directAverageButton, stack.firstElementChild || null);

    return stack;
  };

  const ensureCourseImportButton = (row, { headerWrapper = null, promptOption = null, courseInfo = null } = {}) => {
    if (!row || hasCourseImportButton(row) || typeof onAddCourse !== "function") return;

    const stack = getButtonStack(row);
    if (!stack) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "registration__course-import-button";
    setCourseImportButtonContent(button);

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.loading === "true") return;
      button.dataset.loading = "true";
      button.disabled = true;
      button.textContent = "Adding...";

      try {
        const added = await onAddCourse({
          row,
          headerWrapper,
          promptOption,
          courseInfo,
          link: getPromptLink(promptOption),
        });
        if (added) {
          button.textContent = "Added";
        } else {
          setCourseImportButtonContent(button);
        }
      } catch (error) {
        debug.error({ id: "setupRegistrationAverageButtons.addCourse.error" }, "Failed to add course", {
          courseInfo,
          error: String(error),
        });
        button.textContent = "Could not add";
      } finally {
        button.dataset.loading = "false";
        setTimeout(() => {
          button.disabled = false;
          setCourseImportButtonContent(button);
        }, 1600);
      }
    });

    stack.appendChild(button);
    debug.log({ id: "setupRegistrationAverageButtons.addCourse.inserted" }, "Inserted registration add-course button", {
      courseInfo,
    });
  };

  const getRegistrationAverageButtonState = (headerWrapper) => {
    const row = getRegistrationContainer(headerWrapper);
    const rowPreview = summarizeDebugText(row?.innerText || headerWrapper?.innerText || "");
    if (!row) {
      debug.log(
        { id: "setupRegistrationAverageButtons.resolveRow.noRow" },
        "Could not find a registration row while resolving average-button mode",
      );
      return {
        buttonMode: "static",
        staticReason: "not-lecture",
        isLecture: false,
        rowPreview,
        source: "missing-row",
        instructionalFormat: "",
      };
    }

    const compositeInstructionalFormat =
      row.querySelector?.(compositeSubHeaderSelector)?.getAttribute?.("title") ||
      row.querySelector?.(compositeSubHeaderSelector)?.textContent ||
      "";
    if (compositeInstructionalFormat) {
      const isLecture = isLectureFormat(compositeInstructionalFormat);
      debug.log(
        { id: "setupRegistrationAverageButtons.resolveRow.composite" },
        "Resolved row average-button mode from composite subheader",
        {
          instructionalFormat: summarizeDebugText(compositeInstructionalFormat),
          isLecture,
          buttonMode: isLecture ? "interactive" : "static",
          rowPreview,
        },
      );
      return {
        buttonMode: isLecture ? "interactive" : "static",
        staticReason: isLecture ? null : "not-lecture",
        isLecture,
        rowPreview,
        source: "composite-subheader",
        instructionalFormat: summarizeDebugText(compositeInstructionalFormat),
      };
    }

    const fallbackInstructionalText = row.innerText || headerWrapper.innerText || "";
    const isLecture = isLectureFormat(fallbackInstructionalText);
    debug.log(
      { id: "setupRegistrationAverageButtons.resolveRow.fallback" },
      "Resolved row average-button mode from fallback text",
      {
        instructionalFormat: summarizeDebugText(fallbackInstructionalText),
        isLecture,
        buttonMode: isLecture ? "interactive" : "static",
        rowPreview,
      },
    );
    return {
      buttonMode: isLecture ? "interactive" : "static",
      staticReason: isLecture ? null : "not-lecture",
      isLecture,
      rowPreview,
      source: "fallback-text",
      instructionalFormat: summarizeDebugText(fallbackInstructionalText),
    };
  };

  const createAverageButton = ({
    courseInfo = null,
    courseId = "",
    mode = "interactive",
    staticReason = null,
  } = {}) => {
    debug.log({ id: "setupRegistrationAverageButtons.createButton" }, "Creating registration average button", {
      courseInfo,
      mode,
      staticReason,
    });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "registration__avg-button";
    if (mode === "static") {
      button.classList.add("registration__avg-button--static");
      if (staticReason === "not-lecture") {
        button.textContent = getStaticButtonLabel(staticReason);
      } else {
        setAverageButtonContent(button, getStaticButtonLabel(staticReason));
      }
      button.disabled = true;
      button.tabIndex = -1;
      return button;
    }

    setAverageButtonContent(button, "Class Average\n(past 5 years)");

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.loading === "true") return;
      button.dataset.loading = "true";
      button.textContent = "loading...";
      button.disabled = true;
      debug.log({ id: "setupRegistrationAverageButtons.fetch.start" }, "Fetching average data", { courseInfo });

      termCampus = readTermCampus() || termCampus;
      if (!termCampus) {
        debug.warn({ id: "setupRegistrationAverageButtons.fetch.noTermCampus" }, "Could not determine term campus");
        setAverageButtonContent(button, "Average:\nunavailable");
        button.disabled = false;
        button.dataset.loading = "false";
        return;
      }

      try {
        const resolvedCourseInfo = await resolveCourseInfoForAverage({ courseId });

        if (!resolvedCourseInfo) {
          debug.warn({ id: "setupRegistrationAverageButtons.fetch.noCourseInfo" }, "Could not resolve course info", {
            courseId,
          });
          setAverageButtonContent(button, "Average:\nunavailable");
          return;
        }

        const data = await fetchSectionGradesWithFallback(
          {
            campus: termCampus.campus,
            yearsession: termCampus.yearsession,
            subject: resolvedCourseInfo.subject,
            course: resolvedCourseInfo.course,
            section: resolvedCourseInfo.section,
          },
          { isValid: hasValidAverage },
        );

        if (!data) {
          debug.warn({ id: "setupRegistrationAverageButtons.fetch.noData" }, "No average data returned", {
            courseInfo: resolvedCourseInfo,
          });
          setAverageButtonContent(button, "Average:\nunavailable");
        } else {
          const average = extractAverage(data);
          debug.log({ id: "setupRegistrationAverageButtons.fetch.success" }, "Average data loaded", {
            courseInfo: resolvedCourseInfo,
            average,
          });
          setAverageButtonContent(button, buildAverageLabel(average));
        }
      } catch (error) {
        debug.error({ id: "setupRegistrationAverageButtons.fetch.error" }, "Failed to load average data", {
          courseInfo,
          error: String(error),
        });
        setAverageButtonContent(button, "Average:\nunavailable");
      } finally {
        button.disabled = false;
        button.dataset.loading = "false";
      }
    });

    return button;
  };

  const ensureAverageButton = (headerWrapper) => {
    if (!headerWrapper || !(headerWrapper instanceof Element)) return;
    const row = getRegistrationContainer(headerWrapper);
    const rowPreview = summarizeDebugText(row?.innerText || headerWrapper.innerText || "");
    const alreadyHasButton = hasAverageButton(row);
    debug.log({ id: "setupRegistrationAverageButtons.ensureButton.rowState" }, "Evaluating row button state", {
      alreadyHasButton,
      rowPreview,
    });
    if (alreadyHasButton) {
      ensureCourseImportButton(row, { headerWrapper, promptOption: getCoursePromptOption(row) || headerWrapper });
      debug.log(
        { id: "setupRegistrationAverageButtons.ensureButton.skipExisting" },
        "Skipped row because an average button is already present",
        {
          rowPreview,
        },
      );
      return;
    }

    const buttonState = getRegistrationAverageButtonState(headerWrapper);
    debug.log(
      { id: "setupRegistrationAverageButtons.ensureButton.decision" },
      "Finished row average-button mode check",
      {
        buttonMode: buttonState.buttonMode,
        staticReason: buttonState.staticReason,
        instructionalFormat: buttonState.instructionalFormat,
        instructionalFormatSource: buttonState.source,
        rowPreview: buttonState.rowPreview || rowPreview,
      },
    );

    if (row) {
      row.style.display = "flex";
      row.style.alignItems = "flex-start";
    }

    const stack = getButtonStack(row);

    if (buttonState.buttonMode === "static") {
      const button = createAverageButton({
        mode: "static",
        staticReason: buttonState.staticReason,
      });
      stack?.appendChild(button);
      ensureCourseImportButton(row, { headerWrapper });
      debug.log(
        { id: "setupRegistrationAverageButtons.ensureButton.inserted" },
        "Inserted static registration average button",
        {
          staticReason: buttonState.staticReason,
          rowPreview: buttonState.rowPreview || rowPreview,
        },
      );
      return;
    }

    const promptOption = getCoursePromptOption(row) || headerWrapper;
    const courseId = extractWorkdayCourseIdFromElement(row);

    if (!courseId) {
      const fallbackButton = createAverageButton({
        mode: "static",
        staticReason: "unavailable",
      });
      stack?.appendChild(fallbackButton);
      ensureCourseImportButton(row, { headerWrapper, promptOption });
      debug.warn(
        { id: "setupRegistrationAverageButtons.ensureButton.noCourseId" },
        "Could not find Workday course ID for lecture row; inserted unavailable average button",
        {
          rowPreview: buttonState.rowPreview || rowPreview,
        },
      );
      return;
    }

    const button = createAverageButton({ courseId, mode: "interactive" });
    stack?.appendChild(button);
    ensureCourseImportButton(row, { headerWrapper, promptOption });
    debug.log(
      { id: "setupRegistrationAverageButtons.ensureButton.inserted" },
      "Inserted interactive registration average button",
      {
        courseId,
        rowPreview: buttonState.rowPreview || rowPreview,
      },
    );
  };

  const handleAverageButtonNodes = (node) => {
    if (!(node instanceof Element)) return;

    if (node.matches?.(averageButtonSelector)) {
      ensureAverageButton(node);
    }
    node.querySelectorAll?.(averageButtonSelector).forEach((el) => ensureAverageButton(el));
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type !== "childList" || mutation.addedNodes.length === 0) return;
      mutation.addedNodes.forEach((node) => handleAverageButtonNodes(node));
    });
  });

  handleAverageButtonNodes(document.body);
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    debug.log({ id: "setupRegistrationAverageButtons.cleanup" }, "Disconnecting average button observer");
    observer.disconnect();
  };
}
