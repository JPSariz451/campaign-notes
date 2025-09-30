// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyARi6KlkmX-4KzZFjFjOUh7AAzyggnsoQU",
  authDomain: "campaign-notes-2f3cf.firebaseapp.com",
  projectId: "campaign-notes-2f3cf",
  storageBucket: "campaign-notes-2f3cf.firebasestorage.app",
  messagingSenderId: "462438420489",
  appId: "1:462438420489:web:e77cc6531f104bfefba8d8"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
// ---------------------------------------------------------------

// --- CRDT Setup ---
const YDoc = new Y.Doc();
function getYText(key) {
  return YDoc.getText(key);
}

function bindYTextToTextarea(ytext, textarea, onChange) {
  const onTextareaInput = () => {
    if (textarea.value !== ytext.toString()) {
      ytext.delete(0, ytext.length);
      ytext.insert(0, textarea.value);
    }
    onChange && onChange();
  };

  const onYTextObserve = () => {
    if (textarea.value !== ytext.toString()) {
      textarea.value = ytext.toString();
      onChange && onChange();
    }
  };

  textarea.addEventListener('input', onTextareaInput);
  ytext.observe(onYTextObserve);
  textarea.value = ytext.toString(); // Initial sync

  // Return a function to unbind the listeners
  return () => {
    textarea.removeEventListener('input', onTextareaInput);
    ytext.unobserve(onYTextObserve);
  };
}
// ---------------------------------------------------------------


// --- Application State ---
let currentCampaignId = null;
let allNotes = [];
let displayedNotes = [];
let activeNote = null;
let ytext = null;
let unbindYjs = null;


// --- DOM Elements ---
const campaignSelectionOverlay = document.getElementById('campaign-selection-overlay');
const campaignChoicesEl = document.getElementById('campaign-choices');
const newCampaignBtn = document.getElementById('new-campaign-btn');
const campaignTitleHeader = document.getElementById('campaign-title-header');
const notesGridEl = document.getElementById('notes-grid');
const fileExplorerListEl = document.getElementById('file-explorer-list');
const tagFilterListEl = document.getElementById('tag-filter-list');
const searchBarEl = document.getElementById('search-bar');
const createNewNoteBtn = document.getElementById('create-new-note-btn');

// Editor Modal Elements
const noteEditorOverlay = document.getElementById('note-editor-overlay');
const noteTitleInput = document.getElementById('note-title-input');
const noteTagsInput = document.getElementById('note-tags-input');
const editorEl = document.getElementById('editor');
const previewEl = document.getElementById('preview');
const saveNoteBtn = document.getElementById('save-note-btn');


// --- Campaign Selection ---
function loadCampaignsForSelection() {
  db.collection("campaigns").get().then(snapshot => {
    campaignChoicesEl.innerHTML = '';
    snapshot.docs.forEach(doc => {
      const campaign = { id: doc.id, ...doc.data() };
      const button = document.createElement('button');
      button.textContent = campaign.name;
      button.onclick = () => selectCampaign(campaign.id, campaign.name);
      campaignChoicesEl.appendChild(button);
    });
  });
}

function selectCampaign(id, name) {
  currentCampaignId = id;
  campaignTitleHeader.textContent = name;
  campaignSelectionOverlay.classList.remove('visible');
  loadNotesForCampaign(id);
}

newCampaignBtn.onclick = () => {
  const name = prompt("New Campaign Name?");
  if (name && name.trim()) {
    db.collection("campaigns").add({ name, created: new Date() }).then(() => {
      loadCampaignsForSelection();
    });
  }
};


// --- Note Rendering and Filtering ---
function renderNoteCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card';
  card.onclick = () => openNoteEditor(note);

  const title = document.createElement('div');
  title.className = 'note-card-title';
  title.textContent = note.title;

  const preview = document.createElement('div');
  preview.className = 'note-card-preview';
  preview.textContent = note.content.substring(0, 150); // Simple text preview

  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'note-card-tags';
  note.tags.forEach(tag => {
    const tagEl = document.createElement('span');
    tagEl.className = 'note-card-tag';
    tagEl.textContent = tag;
    tagsContainer.appendChild(tagEl);
  });
  
  card.append(title, preview, tagsContainer);
  return card;
}

function renderAll() {
  // Filter notes based on search and tags
  const searchTerm = searchBarEl.value.toLowerCase();
  const selectedTag = document.querySelector('#tag-filter-list li.selected')?.dataset.tag;

  displayedNotes = allNotes.filter(note => {
    const titleMatch = note.title.toLowerCase().includes(searchTerm);
    const contentMatch = note.content.toLowerCase().includes(searchTerm);
    const tagMatch = !selectedTag || note.tags.includes(selectedTag);
    return (titleMatch || contentMatch) && tagMatch;
  });

  // Render Notes Grid
  notesGridEl.innerHTML = '';
  displayedNotes.forEach(note => {
    notesGridEl.appendChild(renderNoteCard(note));
  });

  // Render File Explorer
  fileExplorerListEl.innerHTML = '';
  allNotes.forEach(note => {
    const li = document.createElement('li');
    li.textContent = note.title;
    li.onclick = () => openNoteEditor(note);
    fileExplorerListEl.appendChild(li);
  });

  // Render Tags List
  const allTags = [...new Set(allNotes.flatMap(note => note.tags))];
  tagFilterListEl.innerHTML = '';
  const allLi = document.createElement('li'); // "All" filter
  allLi.textContent = 'All Notes';
  allLi.className = !selectedTag ? 'selected' : '';
  allLi.onclick = () => {
    document.querySelector('#tag-filter-list li.selected')?.classList.remove('selected');
    allLi.classList.add('selected');
    renderAll();
  };
  tagFilterListEl.appendChild(allLi);

  allTags.sort().forEach(tag => {
    const li = document.createElement('li');
    li.textContent = tag;
    li.dataset.tag = tag;
    li.className = selectedTag === tag ? 'selected' : '';
    li.onclick = () => {
      document.querySelector('#tag-filter-list li.selected')?.classList.remove('selected');
      li.classList.add('selected');
      renderAll();
    };
    tagFilterListEl.appendChild(li);
  });
}

// --- Data Loading ---
function loadNotesForCampaign(campaignId) {
  db.collection("notes")
    .where("campaignId", "==", campaignId)
    .orderBy("updated", "desc")
    .onSnapshot(snapshot => {
      allNotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderAll();
    });
}

// --- Note Editor ---
function renderPreview() {
  previewEl.innerHTML = marked.parse(editorEl.value);
}

function openNoteEditor(note) {
  activeNote = note;
  noteTitleInput.value = note.title;
  noteTagsInput.value = note.tags.join(', ');
  
  if (unbindYjs) unbindYjs(); // Unbind previous note's listener

  ytext = getYText(note.id);
  if (!ytext.toString() && note.content) {
    ytext.insert(0, note.content);
  }
  unbindYjs = bindYTextToTextarea(ytext, editorEl, renderPreview);
  
  renderPreview();
  noteEditorOverlay.classList.add('visible');
}

function closeAndSaveNote() {
  if (!activeNote) return;

  const tags = noteTagsInput.value.split(',').map(t => t.trim()).filter(Boolean);

  db.collection("notes").doc(activeNote.id).update({
    title: noteTitleInput.value,
    content: editorEl.value,
    tags: tags,
    updated: new Date()
  });

  if (unbindYjs) {
    unbindYjs();
    unbindYjs = null;
  }
  activeNote = null;
  noteEditorOverlay.classList.remove('visible');
}

createNewNoteBtn.onclick = () => {
  if (!currentCampaignId) return;
  const newNote = {
    campaignId: currentCampaignId,
    title: 'New Note',
    content: '# New Note\n\nStart writing...',
    tags: [],
    created: new Date(),
    updated: new Date()
  };
  db.collection("notes").add(newNote).then(docRef => {
    openNoteEditor({ id: docRef.id, ...newNote });
  });
};

saveNoteBtn.onclick = closeAndSaveNote;
searchBarEl.oninput = renderAll;
editorEl.addEventListener('input', renderPreview);


// --- Initialization ---
window.onload = () => {
  loadCampaignsForSelection();
};