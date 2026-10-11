const API_URL = "https://jsonplaceholder.typicode.com/posts";
const SAVED_NOTES_KEY = "quicknotes.savedNotes";
const DELETED_NOTES_KEY = "quicknotes.deletedServerNoteIds";

const loadButton = document.querySelector("#load-btn");
const statusMessage = document.querySelector("#status");
const notesList = document.querySelector("#notes-list");
const noteForm = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitButton = document.querySelector("#submit-btn");
const exampleButtons = document.querySelectorAll(".use-example");
let notes = [];

function setStatus(message, kind = "") {
  statusMessage.textContent = message;
  statusMessage.className = kind ? `status-${kind}` : "";
}

function setRequestState(isRunning) {
  loadButton.disabled = isRunning;
  submitButton.disabled = isRunning;
  notesList.querySelectorAll("button").forEach((button) => {
    button.disabled = isRunning;
  });
  exampleButtons.forEach((button) => {
    button.disabled = isRunning;
  });
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`The server returned status ${response.status}.`);
  }
  return { data: await response.json(), status: response.status };
}

function getSavedNotes() {
  const savedNotes = localStorage.getItem(SAVED_NOTES_KEY);
  if (!savedNotes) {
    return [];
  }

  const parsedNotes = JSON.parse(savedNotes);
  if (
    !Array.isArray(parsedNotes) ||
    !parsedNotes.every(
      (note) =>
        note &&
        typeof note.id === "string" &&
        typeof note.title === "string" &&
        typeof note.body === "string",
    )
  ) {
    throw new Error("Saved notes are invalid. Clear this browser's QuickNotes data and try again.");
  }
  return parsedNotes;
}

function saveNotes(savedNotes) {
  localStorage.setItem(SAVED_NOTES_KEY, JSON.stringify(savedNotes));
}

function getDeletedNoteIds() {
  const deletedNoteIds = localStorage.getItem(DELETED_NOTES_KEY);
  if (!deletedNoteIds) {
    return [];
  }

  const parsedIds = JSON.parse(deletedNoteIds);
  if (
    !Array.isArray(parsedIds) ||
    !parsedIds.every(
      (id) => typeof id === "string" || typeof id === "number",
    )
  ) {
    throw new Error("Deleted note records are invalid. Clear this browser's QuickNotes data and try again.");
  }
  return parsedIds;
}

function saveDeletedNoteIds(deletedNoteIds) {
  localStorage.setItem(DELETED_NOTES_KEY, JSON.stringify(deletedNoteIds));
}

function renderNotes(notes) {
  notesList.replaceChildren();

  if (notes.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "No notes found. Create one to get started.";
    emptyItem.className = "empty-state";
    notesList.append(emptyItem);
    return;
  }

  notes.forEach((note) => {
    const item = document.createElement("li");
    const title = document.createElement("h3");
    const body = document.createElement("p");
    const deleteButton = document.createElement("button");

    title.textContent = note.title;
    body.textContent = note.body || "";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteNote(note.id));
    item.append(title, body, deleteButton);
    notesList.append(item);
  });
}

async function loadNotes() {
  setRequestState(true);
  setStatus("Loading notes...");

  try {
    const result = await request(`${API_URL}?_limit=10`);
    const savedNotes = getSavedNotes();
    const deletedNoteIds = getDeletedNoteIds();
    const serverNotes = result.data.filter(
      (serverNote) =>
        !deletedNoteIds.includes(serverNote.id) &&
        !savedNotes.some((savedNote) => savedNote.serverId === serverNote.id),
    );
    notes = [...savedNotes, ...serverNotes];
    renderNotes(notes);
    const hiddenCount = result.data.filter((serverNote) =>
      deletedNoteIds.includes(serverNote.id),
    ).length;
    const hiddenMessage = hiddenCount
      ? `; hid ${hiddenCount} previously deleted practice note${hiddenCount === 1 ? "" : "s"} in this browser`
      : "";
    const savedMessage = savedNotes.length
      ? `; ${savedNotes.length} saved in this browser`
      : "";
    setStatus(
      `Loaded ${serverNotes.length} notes from the server${hiddenMessage}${savedMessage}.`,
      "success",
    );
  } catch (error) {
    setStatus(`Could not load notes. ${error.message}`, "error");
  } finally {
    setRequestState(false);
  }
}

async function deleteNote(id) {
  setRequestState(true);
  setStatus("Deleting note...");
  try {
    const note = notes.find((currentNote) => currentNote.id === id);
    const serverId = note?.serverId ?? id;
    const result = await request(`${API_URL}/${encodeURIComponent(serverId)}`, {
      method: "DELETE",
    });

    // JSONPlaceholder confirms DELETE but does not persist it; update this page's list.
    if (note?.serverId !== undefined) {
      saveNotes(getSavedNotes().filter((savedNote) => savedNote.id !== id));
    } else {
      const deletedNoteIds = getDeletedNoteIds();
      if (!deletedNoteIds.includes(serverId)) {
        saveDeletedNoteIds([...deletedNoteIds, serverId]);
      }
    }
    notes = notes.filter((note) => note.id !== id);
    renderNotes(notes);
    setStatus(`Note deleted (status ${result.status}).`, "success");
  } catch (error) {
    setStatus(`Could not delete note. ${error.message}`, "error");
  } finally {
    setRequestState(false);
  }
}

async function createNote(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  if (!title) {
    setStatus("Please enter a title for your note.", "error");
    titleInput.focus();
    return;
  }
  if (title.length > 100) {
    setStatus("The title must be 100 characters or fewer.", "error");
    titleInput.focus();
    return;
  }

  setRequestState(true);
  setStatus("Creating note...");
  try {
    const result = await request(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        title,
        body: bodyInput.value.trim(),
        userId: 1,
      }),
    });

    // JSONPlaceholder simulates writes, so keep created notes in browser storage.
    const savedNote = {
      ...result.data,
      id: `local-${Date.now()}-${crypto.randomUUID()}`,
      serverId: result.data.id,
    };
    const savedNotes = [...getSavedNotes(), savedNote];
    saveNotes(savedNotes);
    notes = [savedNote, ...notes];
    renderNotes(notes);
    noteForm.reset();
    setStatus(
      `Note created (status ${result.status}, id ${result.data.id}).`,
      "success",
    );
  } catch (error) {
    setStatus(`Could not create note. ${error.message}`, "error");
  } finally {
    setRequestState(false);
  }
}

loadButton.addEventListener("click", loadNotes);
noteForm.addEventListener("submit", createNote);
try {
  notes = getSavedNotes();
  renderNotes(notes);
} catch (error) {
  setStatus(`Could not read saved notes. ${error.message}`, "error");
}
exampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    titleInput.value = button.dataset.title;
    bodyInput.value = button.dataset.body;
    setStatus("Example ready. You can edit it before creating.", "success");
    titleInput.focus();
  });
});
