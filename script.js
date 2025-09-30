// --- Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyARi6KlkmX-4KzZFjFjOUh7AAzyggnsoQU",
  authDomain: "campaign-notes-2f3cf.firebaseapp.com",
  projectId: "campaign-notes-2f3cf",
  storageBucket: "campaign-notes-2f3cf.firebasestorage.app",
  messagingSenderId: "462438420489",
  appId: "1:462438420489:web:e77cc6531f104bfefba8d8"
};
// ---------------------------------------------------------------

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- CRDT Setup

// Yjs CRDT integration for collaborative editing
// Exposes: YDoc, getYText, bindYTextToTextarea

const YDoc = new Y.Doc();

function getYText(key) {
  return YDoc.getText(key);
}

function bindYTextToTextarea(ytext, textarea, onChange) {
  // Local -> Yjs
  textarea.addEventListener('input', () => {
    if (textarea.value !== ytext.toString()) {
      ytext.delete(0, ytext.length);
      ytext.insert(0, textarea.value);
    }
    onChange && onChange();
  });
  // Yjs -> Local
  ytext.observe(event => {
    if (textarea.value !== ytext.toString()) {
      textarea.value = ytext.toString();
      onChange && onChange();
    }
  });
  // Initial sync
  textarea.value = ytext.toString();
}

// --- Application Logic ---

// Campaign Notes App - Minimalist core logic
const campaignListEl = document.getElementById('campaign-list');
const newCampaignBtn = document.getElementById('new-campaign-btn');
const noteTitleEl = document.getElementById('note-title');
const saveNoteBtn = document.getElementById('save-note-btn');
const editorEl = document.getElementById('editor');
const previewEl = document.getElementById('preview');

let campaigns = [];
let selectedCampaign = null;
let ytext = null;

function renderCampaigns() {
  campaignListEl.innerHTML = "";
  campaigns.forEach(camp => {
    const li = document.createElement('li');
    li.textContent = camp.title;
    li.className = camp.id === (selectedCampaign && selectedCampaign.id) ? "selected" : "";
    li.onclick = () => selectCampaign(camp.id);
    campaignListEl.appendChild(li);
  });
}

function selectCampaign(id) {
  selectedCampaign = campaigns.find(c => c.id === id);
  renderCampaigns();
  noteTitleEl.value = selectedCampaign.title;
  loadNoteContent(selectedCampaign.id);
}

function loadCampaigns() {
  db.collection("campaigns").orderBy("created", "asc").onSnapshot(snapshot => {
    campaigns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (!selectedCampaign && campaigns.length) selectCampaign(campaigns[0].id);
    renderCampaigns();
  });
}

function loadNoteContent(campaignId) {
  if (ytext) ytext.unobserveAll(); // Unbind previous
  db.collection("campaigns").doc(campaignId).get().then(doc => {
    const note = doc.data().note || "";
    // Setup Yjs for CRDT editing
    ytext = getYText(campaignId);
    if (!ytext.toString()) { ytext.insert(0, note); }
    bindYTextToTextarea(ytext, editorEl, renderPreview);
    renderPreview();
  });
}

function renderPreview() {
  previewEl.innerHTML = marked.parse(editorEl.value);
}

function saveNote() {
  if (!selectedCampaign) return;
  db.collection("campaigns").doc(selectedCampaign.id).update({
    title: noteTitleEl.value,
    note: editorEl.value,
    updated: new Date()
  });
}

saveNoteBtn.onclick = saveNote;
noteTitleEl.onchange = saveNote;
editorEl.addEventListener('input', renderPreview);

newCampaignBtn.onclick = () => {
  const title = prompt("New Campaign Title?");
  if (!title) return;
  db.collection("campaigns").add({
    title,
    note: "",
    created: new Date(),
    updated: new Date()
  });
};

window.onload = () => {
  renderPreview();
  loadCampaigns();
};