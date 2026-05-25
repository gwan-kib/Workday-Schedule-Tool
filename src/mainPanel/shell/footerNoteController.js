const DEFAULT_TEMPORARY_DURATION_MS = 3000;
const DEFAULT_MAX_TEMPORARY_NOTES = 3;

let nextFooterNoteId = 0;

const createFooterNoteId = (prefix) => {
  nextFooterNoteId += 1;
  return `${prefix}-${nextFooterNoteId}`;
};

function normalizeNoteText(text) {
  return String(text || "").trim();
}

function clearNoteTimer(note) {
  if (!note?.timeoutId) return;
  clearTimeout(note.timeoutId);
  note.timeoutId = 0;
}

// Maintains independent temporary and persistent footer-note stacks. Input: root element. Output: controller API.
export function createFooterNoteController(root, { maxTemporaryNotes = DEFAULT_MAX_TEMPORARY_NOTES } = {}) {
  const temporaryNotes = [];
  const persistentNotes = [];

  if (root) {
    root.classList.add("footer-note-stack");
    root.classList.remove("footer-alert");
    root.textContent = "";
    root.removeAttribute("data-tone");
  }

  const render = () => {
    if (!root) return;

    root.innerHTML = "";

    [...temporaryNotes, ...persistentNotes].forEach((note) => {
      const item = document.createElement("div");
      item.className = "footer-note";
      item.dataset.kind = note.kind;
      item.dataset.tone = note.tone;
      item.textContent = note.text;
      root.appendChild(item);
    });

    root.classList.toggle("is-hidden", temporaryNotes.length + persistentNotes.length === 0);
  };

  const removeTemporary = (id) => {
    const index = temporaryNotes.findIndex((note) => note.id === id);
    if (index === -1) return;

    const [removed] = temporaryNotes.splice(index, 1);
    clearNoteTimer(removed);
    render();
  };

  const showTemporary = (text, { tone = "info", durationMs = DEFAULT_TEMPORARY_DURATION_MS, id = null } = {}) => {
    const normalizedText = normalizeNoteText(text);
    if (!normalizedText) return null;

    const noteId = id || createFooterNoteId("temporary-footer-note");
    let note = temporaryNotes.find((existing) => existing.id === noteId);

    if (note) {
      clearNoteTimer(note);
      note.text = normalizedText;
      note.tone = tone;
      temporaryNotes.splice(temporaryNotes.indexOf(note), 1);
      temporaryNotes.unshift(note);
    } else {
      note = {
        id: noteId,
        kind: "temporary",
        text: normalizedText,
        tone,
        timeoutId: 0,
      };
      temporaryNotes.unshift(note);
    }

    while (temporaryNotes.length > maxTemporaryNotes) {
      const removed = temporaryNotes.pop();
      clearNoteTimer(removed);
    }

    if (durationMs > 0) {
      note.timeoutId = setTimeout(() => removeTemporary(noteId), durationMs);
    }

    render();
    return noteId;
  };

  const removePersistent = (id) => {
    const index = persistentNotes.findIndex((note) => note.id === id);
    if (index === -1) return;

    persistentNotes.splice(index, 1);
    render();
  };

  const setPersistent = (id, text, { tone = "warn" } = {}) => {
    const normalizedText = normalizeNoteText(text);
    if (!id || !normalizedText) {
      if (id) removePersistent(id);
      return null;
    }

    let note = persistentNotes.find((existing) => existing.id === id);
    if (note) {
      note.text = normalizedText;
      note.tone = tone;
    } else {
      note = {
        id,
        kind: "persistent",
        text: normalizedText,
        tone,
      };
      persistentNotes.unshift(note);
    }

    render();
    return id;
  };

  render();

  return {
    showTemporary,
    removeTemporary,
    setPersistent,
    removePersistent,
  };
}
