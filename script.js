const CAT_KEY = "paper-shelf-catalog-v1";
const DB_NAME = "paper-shelf-db";
const DB_STORE = "pdfs";
const SUBJECTS = ["Markets", "ILT", "Games", "Agency", "Psychology", "Persuasion", "Money", "School", "Other"];
const PUBLIC_URL = (typeof location !== "undefined" && location.protocol === "https:")
  ? (location.origin + location.pathname.replace(/index\.html$/, "").replace(/\/?$/, "/"))
  : "";

if (window["pdfjsLib"]) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js";
}

let catalog = [];
let view = { name: "home", subject: null, paperId: null, q: "" };
let flash = "";
let addOpen = false;
let installOpen = false;
let offline = { state: "unknown", done: 0, total: 0, label: "Checking…" };

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function uid() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(id, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function loadCatalogMeta() {
  try {
    const raw = localStorage.getItem(CAT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) {}
  return null;
}
function saveCatalogMeta() {
  localStorage.setItem(CAT_KEY, JSON.stringify(catalog));
}
async function bootCatalog() {
  const saved = loadCatalogMeta();
  const seed = await fetch("catalog.json").then((r) => r.json()).catch(() => []);
  if (!saved) {
    catalog = seed.slice();
    saveCatalogMeta();
    return;
  }
  const byId = new Map(saved.map((p) => [p.id, p]));
  seed.forEach((s) => { if (!byId.has(s.id)) byId.set(s.id, s); });
  catalog = Array.from(byId.values());
  saveCatalogMeta();
}

function subjectsWithCounts() {
  const map = {};
  SUBJECTS.forEach((s) => { map[s] = 0; });
  catalog.forEach((p) => {
    const s = SUBJECTS.indexOf(p.subject) >= 0 ? p.subject : "Other";
    map[s] = (map[s] || 0) + 1;
  });
  return SUBJECTS.filter((s) => (map[s] || 0) > 0 || s === "Other").map((s) => ({ name: s, count: map[s] || 0 }));
}
function papersIn(subject, q) {
  q = (q || "").trim().toLowerCase();
  return catalog
    .filter((p) => !subject || p.subject === subject)
    .filter((p) => !q || (p.title + " " + p.subject).toLowerCase().indexOf(q) !== -1)
    .sort((a, b) => a.title.localeCompare(b.title));
}
function paperById(id) { return catalog.find((p) => p.id === id); }

async function resolvePdfUrl(paper) {
  if (paper.stored) {
    const blob = await idbGet(paper.id);
    if (!blob) throw new Error("Stored PDF missing. Re-add the file.");
    return URL.createObjectURL(blob);
  }
  return paper.file;
}

function setOffline(partial) {
  offline = Object.assign({}, offline, partial);
  if (offline.state === "ready") offline.label = "Ready";
  else if (offline.state === "caching") {
    const pct = offline.total ? Math.round((offline.done / offline.total) * 100) : 0;
    offline.label = "Caching… " + offline.done + "/" + offline.total + " (" + pct + "%)";
  } else if (offline.state === "needswifi") offline.label = "Needs Wi‑Fi once";
  else offline.label = "Checking…";
  // light re-render of chip only if home/subject visible
  const chip = document.getElementById("offline-chip");
  if (chip) {
    chip.className = "chip " + (offline.state === "ready" ? "ready" : offline.state === "caching" ? "caching" : offline.state === "needswifi" ? "needswifi" : "");
    chip.textContent = offline.label;
  }
  const bar = document.getElementById("cache-bar");
  if (bar && offline.total) bar.style.width = Math.min(100, Math.round((offline.done / offline.total) * 100)) + "%";
  const progText = document.getElementById("cache-prog-text");
  if (progText) progText.textContent = offline.label;
}

function chipClass() {
  if (offline.state === "ready") return "ready";
  if (offline.state === "caching") return "caching";
  if (offline.state === "needswifi") return "needswifi";
  return "";
}

function nfcUrl() {
  if (PUBLIC_URL) return PUBLIC_URL;
  return "https://YOUR-PAGES-URL/  (set after deploy — see NFC.md)";
}

function installSheet() {
  if (!installOpen) return "";
  const url = nfcUrl();
  const pct = offline.total ? Math.min(100, Math.round((offline.done / offline.total) * 100)) : 0;
  return `<div class="sheet-backdrop" id="install-sheet">
    <div class="sheet" role="dialog" aria-label="Install and NFC">
      <div class="top">
        <h2 style="flex:1;margin:0">Install & NFC</h2>
        <button type="button" class="ghost" data-close-install>Close</button>
      </div>
      <p class="sub">One home install on public HTTPS. Then tap the NFC tag at work offline.</p>
      <div class="progress"><i id="cache-bar" style="width:${pct}%"></i></div>
      <p class="meta" id="cache-prog-text">${esc(offline.label)}</p>
      <ol>
        <li>Open this Shelf on <strong>home Wi‑Fi</strong> at the public HTTPS URL (not LAN or localhost).</li>
        <li>Wait until the chip says <strong>Ready</strong> (~13&nbsp;MB of seed PDFs + app shell).</li>
        <li><strong>iPhone:</strong> Safari → Share → Add to Home Screen → confirm Paper Shelf.</li>
        <li>Write this exact URL to an NFC tag (iPhone Shortcuts → Automations / Tags, or NFC Tools):</li>
      </ol>
      <div class="url-box" id="nfc-url">${esc(url)}</div>
      <button type="button" class="ghost wide" data-copy-url>Copy HTTPS URL</button>
      <ol start="5">
        <li>At work: tap the tag → Shelf opens from Home Screen cache → Growth + VENOM scroll with airplane mode on.</li>
      </ol>
      <p class="meta">LAN and localhost URLs fail for NFC. User-added PDFs stay on this device (IndexedDB) and are not in the shared cache.</p>
    </div>
  </div>`;
}

function paperRow(p) {
  return `<button type="button" class="paper" data-open="${esc(p.id)}">
    <div class="title">${esc(p.title)}</div>
    <div class="meta"><span class="badge ${p.badge === "phone" ? "phone" : ""}">${esc(p.badge || "letter")}</span> ${esc(p.subject)}${p.stored ? " · added" : ""}</div>
  </button>`;
}

function addForm() {
  return `<form id="add-form">
    <label for="add-file">PDF file</label>
    <input id="add-file" type="file" accept="application/pdf,.pdf" required>
    <label for="add-title">Title</label>
    <input id="add-title" type="text" placeholder="Optional — defaults to filename">
    <label for="add-subject">Subject</label>
    <select id="add-subject">${SUBJECTS.map((s) => `<option value="${esc(s)}" ${view.subject === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
    <label for="add-badge">Badge</label>
    <select id="add-badge"><option value="letter">letter</option><option value="phone">phone</option></select>
    <p class="err" id="add-err"></p>
    <button class="primary wide" type="submit">Save to shelf</button>
  </form>`;
}

function renderHome() {
  const q = view.q || "";
  const subs = subjectsWithCounts();
  const hits = q ? papersIn(null, q) : null;
  return `
    <div class="top">
      <h1 class="brand">Paper Shelf</h1>
    </div>
    <div class="top-actions" style="margin-bottom:12px">
      <span class="chip ${chipClass()}" id="offline-chip">${esc(offline.label)}</span>
      <button type="button" class="ghost" data-open-install>Install & NFC</button>
    </div>
    <p class="sub">Personal research library. Doomscroll offline after one home install.</p>
    ${flash ? `<div class="flash">${esc(flash)}</div>` : ""}
    <input class="search" id="search" type="search" placeholder="Search titles" value="${esc(q)}" autocomplete="off">
    ${hits
      ? `<div class="list">${hits.length ? hits.map(paperRow).join("") : `<div class="empty">No matches.</div>`}</div>`
      : `<div class="grid">${subs.map((s) => `
          <button type="button" class="subject" data-subject="${esc(s.name)}">
            <h2>${esc(s.name)}</h2>
            <div class="count">${s.count} paper${s.count === 1 ? "" : "s"}</div>
          </button>`).join("")}</div>`}
    <button type="button" class="primary wide" data-toggle-add>${addOpen ? "Hide add" : "Add PDF"}</button>
    <div class="panel ${addOpen ? "" : "closed"}">${addOpen ? addForm() : ""}</div>
    ${installSheet()}
  `;
}

function renderSubject() {
  const list = papersIn(view.subject, view.q);
  return `
    <div class="top">
      <button type="button" class="ghost" data-home>Back</button>
      <h1 class="brand" style="font-size:22px">${esc(view.subject)}</h1>
    </div>
    <div class="top-actions" style="margin-bottom:12px">
      <span class="chip ${chipClass()}" id="offline-chip">${esc(offline.label)}</span>
      <button type="button" class="ghost" data-open-install>Install & NFC</button>
    </div>
    ${flash ? `<div class="flash">${esc(flash)}</div>` : ""}
    <input class="search" id="search" type="search" placeholder="Filter in ${esc(view.subject)}" value="${esc(view.q || "")}" autocomplete="off">
    <div class="list">${list.length ? list.map(paperRow).join("") : `<div class="empty">No papers here yet. Add a PDF.</div>`}</div>
    <button type="button" class="primary wide" data-toggle-add>${addOpen ? "Hide add" : "Add PDF"}</button>
    <div class="panel ${addOpen ? "" : "closed"}">${addOpen ? addForm() : ""}</div>
    ${installSheet()}
  `;
}

function render() {
  const el = document.getElementById("app");
  if (view.name === "reader") {
    el.innerHTML = "";
    openReader(view.paperId);
    return;
  }
  el.innerHTML = view.name === "subject" ? renderSubject() : renderHome();
  bind();
}

function bind() {
  const search = document.getElementById("search");
  if (search) {
    search.addEventListener("input", () => {
      view.q = search.value;
      const pos = search.selectionStart;
      render();
      const s = document.getElementById("search");
      if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch (e) {} }
    });
  }
  document.querySelectorAll("[data-subject]").forEach((b) => b.addEventListener("click", () => {
    view = { name: "subject", subject: b.getAttribute("data-subject"), q: "" };
    addOpen = false; flash = ""; render();
  }));
  document.querySelectorAll("[data-home]").forEach((b) => b.addEventListener("click", () => {
    view = { name: "home", q: "" }; addOpen = false; flash = ""; render();
  }));
  document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
    view = { name: "reader", paperId: b.getAttribute("data-open"), subject: view.subject, q: view.q };
    render();
  }));
  document.querySelectorAll("[data-toggle-add]").forEach((b) => b.addEventListener("click", () => {
    addOpen = !addOpen; render();
  }));
  document.querySelectorAll("[data-open-install]").forEach((b) => b.addEventListener("click", () => {
    installOpen = true; render();
  }));
  document.querySelectorAll("[data-close-install]").forEach((b) => b.addEventListener("click", () => {
    installOpen = false; render();
  }));
  const sheet = document.getElementById("install-sheet");
  if (sheet) sheet.addEventListener("click", (e) => {
    if (e.target === sheet) { installOpen = false; render(); }
  });
  document.querySelectorAll("[data-copy-url]").forEach((b) => b.addEventListener("click", async () => {
    const url = nfcUrl();
    try {
      await navigator.clipboard.writeText(url);
      flash = "HTTPS URL copied.";
    } catch (e) {
      flash = "Copy failed — select the URL in the box.";
    }
    render();
  }));
  const form = document.getElementById("add-form");
  if (form) form.addEventListener("submit", onAdd);
  const file = document.getElementById("add-file");
  if (file) file.addEventListener("change", () => {
    const f = file.files && file.files[0];
    const title = document.getElementById("add-title");
    if (f && title && !title.value) title.value = f.name.replace(/\.pdf$/i, "");
  });
}

async function onAdd(e) {
  e.preventDefault();
  const err = document.getElementById("add-err");
  const fileEl = document.getElementById("add-file");
  const f = fileEl.files && fileEl.files[0];
  if (!f) { err.textContent = "Pick a PDF."; return; }
  if (f.type && f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
    err.textContent = "File must be a PDF."; return;
  }
  const id = uid();
  const title = (document.getElementById("add-title").value || f.name.replace(/\.pdf$/i, "")).trim();
  const subject = document.getElementById("add-subject").value;
  const badge = document.getElementById("add-badge").value;
  try {
    await idbPut(id, f);
    catalog.unshift({ id, title, subject, file: "", badge, stored: true, seed: false });
    saveCatalogMeta();
    addOpen = false;
    flash = "Saved on this device. Still here after refresh.";
    view = { name: "subject", subject, q: "" };
    render();
  } catch (ex) {
    err.textContent = "Could not store PDF in this browser.";
  }
}

async function openReader(id) {
  const paper = paperById(id);
  const shell = document.createElement("div");
  shell.className = "reader-shell";
  shell.innerHTML = `
    <div class="reader-bar">
      <button type="button" class="ghost" id="reader-close">Close</button>
      <h1>${esc(paper ? paper.title : "Reader")}</h1>
    </div>
    <div class="reader-strip" id="reader-strip">
      <div class="reader-status" id="reader-status">Loading pages…</div>
    </div>
  `;
  document.body.appendChild(shell);
  document.getElementById("reader-close").onclick = () => {
    shell.remove();
    view = { name: view.subject ? "subject" : "home", subject: view.subject, q: view.q || "" };
    render();
  };
  if (!paper) {
    document.getElementById("reader-status").textContent = "Paper not found.";
    return;
  }
  if (!window.pdfjsLib) {
    document.getElementById("reader-status").textContent = "PDF engine missing from cache. Open once on Wi‑Fi.";
    return;
  }
  try {
    const url = await resolvePdfUrl(paper);
    const pdf = await pdfjsLib.getDocument(url).promise;
    const strip = document.getElementById("reader-strip");
    strip.innerHTML = "";
    const maxW = Math.min(window.innerWidth - 16, 720);
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const unscaled = page.getViewport({ scale: 1 });
      const scale = maxW / unscaled.width;
      const viewport = page.getViewport({ scale: Math.max(scale, 1.1) });
      const canvas = document.createElement("canvas");
      const wrap = document.createElement("div");
      wrap.className = "page-wrap";
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      wrap.appendChild(canvas);
      strip.appendChild(wrap);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    }
    if (String(url).startsWith("blob:")) URL.revokeObjectURL(url);
  } catch (ex) {
    const st = document.getElementById("reader-status");
    if (st) st.textContent = "Could not open PDF. " + (ex && ex.message ? ex.message : "Needs Wi‑Fi once if not cached.");
  }
}

function onSwMessage(data) {
  if (!data || !data.type) return;
  if (data.type === "cache-progress") {
    setOffline({ state: "caching", done: data.done || 0, total: data.total || 0 });
  } else if (data.type === "cache-ready") {
    setOffline({ state: "ready", done: data.total || data.done || 0, total: data.total || data.done || 0 });
  } else if (data.type === "cache-error") {
    setOffline({ state: navigator.onLine ? "caching" : "needswifi" });
  }
}

async function registerSw() {
  if (!("serviceWorker" in navigator)) {
    setOffline({ state: "needswifi", label: "Needs Wi‑Fi once" });
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register("./sw.js");
    navigator.serviceWorker.addEventListener("message", (e) => onSwMessage(e.data));
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "check-cache" });
    }
    if (reg.installing) {
      setOffline({ state: "caching", done: 0, total: 20 });
      reg.installing.addEventListener("statechange", () => {
        if (reg.installing && reg.installing.state === "installed") {
          /* wait for ready message */
        }
      });
    } else if (reg.waiting || reg.active) {
      const sw = reg.active || reg.waiting;
      if (sw) sw.postMessage({ type: "check-cache" });
    }
    // If offline and no controller yet
    if (!navigator.onLine && !navigator.serviceWorker.controller) {
      setOffline({ state: "needswifi" });
    }
  } catch (e) {
    setOffline({ state: navigator.onLine ? "needswifi" : "needswifi" });
  }
}

window.addEventListener("online", () => {
  if (offline.state !== "ready" && navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "check-cache" });
  }
});
window.addEventListener("offline", () => {
  if (offline.state !== "ready") setOffline({ state: "needswifi" });
});

async function start() {
  setOffline({ state: "checking", label: "Checking…" });
  await bootCatalog();
  await registerSw();
  render();
}
start();
