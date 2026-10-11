const API_URL = "https://jsonplaceholder.typicode.com/posts";

const loadButton = document.querySelector("#load-btn");
const statusMessage = document.querySelector("#status");
const notesList = document.querySelector("#notes-list");
const noteForm = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitButton = document.querySelector("#submit-btn");
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
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`The server returned status ${response.status}.`);
  }
  return { data: await response.json(), status: response.status };
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

    title.textContent = note.title;
    body.textContent = note.body || "";
    item.append(title, body);
    notesList.append(item);
  });
}

async function loadNotes() {
  setRequestState(true);
  setStatus("Loading notes...");

  try {
    const result = await request(`${API_URL}?_limit=10`);
    notes = result.data;
    renderNotes(notes);
    setStatus(`Loaded ${notes.length} notes from the server.`, "success");
  } catch (error) {
    setStatus(`Could not load notes. ${error.message}`, "error");
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

    // JSONPlaceholder returns a simulated note; retain it in this page's state.
    notes = [result.data, ...notes];
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
