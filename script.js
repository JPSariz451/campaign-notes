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

  return () => {
    textarea.removeEventListener('input', onTextareaInput);
    ytext.unobserve(onYTextObserve);
  };
}
// ---------------------------------------------------------------

// This wrapper ensures the script runs only after the page is fully loaded.
document.addEventListener('DOMContentLoaded', () => {
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
  const campaignTitleHeader = document.getElementById('campaign-title-header');
  const notesGridEl = document.getElementById('notes-grid');
  const fileExplorerListEl = document.getElementById('file-explorer-list');
  const tagFilterListEl = document.getElementById('tag-filter-list');
  const searchBarEl = document.getElementById('search-bar');
  const createNewNoteBtn = document.getElementById('create-new-note-btn');

  // New Campaign Modal Elements
  const showCreateCampaignBtn = document.getElementById('show-create-campaign-btn');
  const createCampaignOverlay = document.getElementById('create-campaign-overlay');
  const newCampaignNameInput = document.getElementById('new-campaign-name-input');
  const confirmCreateCampaignBtn = document.getElementById('confirm-create-campaign-btn');
  const cancelCreateCampaignBtn = document.getElementById('cancel-create-campaign-btn');

  // Editor Modal Elements
  const noteEditorOverlay = document.getElementById('note-editor-overlay');
  const noteTitleInput = document.getElementById('note-title-input');
  const noteTagsInput = document.getElementById('note-tags-input');
  const editorEl = document.getElementById('editor');
  const previewEl = document.getElementById('preview');
  const saveNoteBtn = document.getElementById('save-note-btn');


  // --- Campaign Selection & Creation ---
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

  showCreateCampaignBtn.onclick = () => {
    createCampaignOverlay.classList.add('visible');
  };

  cancelCreateCampaignBtn.onclick = () => {
    createCampaignOverlay.classList.remove('visible');
    newCampaignNameInput.value = '';
  };
  
  confirmCreateCampaignBtn.onclick = () => {
    const name = newCampaignNameInput.value;
    if (name && name.trim()) {
      confirmCreateCampaignBtn.disabled = true; // Prevent double clicks
      db.collection("campaigns").add({ name, created: new Date() })
        .then(() => {
          newCampaignNameInput.value = '';
          createCampaignOverlay.classList.remove('visible');
          loadCampaignsForSelection();
          confirmCreateCampaignBtn.disabled = false;
        })
        .catch((error) => {
          console.error("Error creating campaign: ", error);
          alert("Could not create campaign. Check console for details.");
          confirmCreateCampaignBtn.disabled = false;
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
    preview.textContent = note.content.substring(0, 150);
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
    const searchTerm = searchBarEl.value.toLowerCase();
    const selectedTag = document.querySelector('#tag-filter-list li.selected')?.dataset.tag;
    displayedNotes = allNotes.filter(note => {
      const titleMatch = note.title.toLowerCase().includes(searchTerm);
      const contentMatch = note.content.toLowerCase().includes(searchTerm);
      const tagMatch = !selectedTag || note.tags.includes(selectedTag);
      return (titleMatch || contentMatch) && tagMatch;
    });
    notesGridEl.innerHTML = '';
    displayedNotes.forEach(note => notesGridEl.appendChild(renderNoteCard(note)));
    fileExplorerListEl.innerHTML = '';
    allNotes.forEach(note => {
      const li = document.createElement('li');
      li.textContent = note.title;
      li.onclick = () => openNoteEditor(note);
      fileExplorerListEl.appendChild(li);
    });
    const allTags = [...new Set(allNotes.flatMap(note => note.tags))];
    tagFilterListEl.innerHTML = '';
    const allLi = document.createElement('li');
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