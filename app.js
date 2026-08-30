// ============================================================================
// Firebase setup. This is an ES module (see index.html: <script type="module">),
// which is what lets us use `import` directly in a plain browser with no build step.
// ============================================================================
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

if (String(firebaseConfig.apiKey || "").includes("PASTE_YOUR")) {
  document.body.innerHTML = `<div style="font-family:system-ui,sans-serif;padding:40px 20px;max-width:480px;margin:0 auto;text-align:center;color:#2B2420;">
    <h2>Setup needed</h2>
    <p>Open <code>firebase-config.js</code> and paste in your own Firebase project's
    values — see README.md for exactly where to find them. The app will work normally
    once that's done.</p></div>`;
  throw new Error("firebase-config.js not yet configured");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Lets the app keep working (read-only, from last-synced data) when connectivity
// drops, and queues any writes made while offline to sync automatically once back
// online. Fails harmlessly in some multi-tab situations, which is fine to ignore.
enableIndexedDbPersistence(db).catch(() => {});

// ============================================================================
// State & constants
// ============================================================================
let ITEMS = [];
let isManager = false;
let mode = "showroom";
let searchType = "text";
let query = "";
let catFilter = "All";
let editingId = null;
let formPhoto = null;
let confirmDeleteId = null;

const CATS = {
  Sofas: "#4A6C6F", Dining: "#B5502A", Bedroom: "#6B4A6B", Chairs: "#5B7048",
  Tables: "#B8863B", Storage: "#6B4226", Office: "#4A5A6B", Outdoor: "#C0713F",
};

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${h % 360}, 35%, 40%)`;
}
function colorFor(cat) { return CATS[cat] || hashColor(cat || "Other"); }
function hexToRgb(hex) {
  if (hex.startsWith("hsl")) return [140, 130, 120];
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mixColor(hex1, hex2, t) {
  const a = hexToRgb(hex1), b = hexToRgb(hex2);
  return a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
}
function stockInfo(it) {
  if (it.stock === 0) return { text: "OUT OF STOCK", color: "#A83232" };
  if (it.stock <= it.reorder) return { text: "LOW STOCK", color: "#B8863B" };
  return { text: "IN STOCK", color: "#5B7048" };
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtINR(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function ensureAvgRgb(it) {
  if (!it.avgRgb) it.avgRgb = mixColor(colorFor(it.category), "#FFFFFF", 0.55);
  return it.avgRgb;
}
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = "✓ " + msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2400);
}

const SEED_ITEMS = [
  { id: "FRN-001", sku: "FRN-001", name: "Oakwood 3-Seater Sofa", category: "Sofas", material: "Oak & Linen", supplier: "WoodCraft Suppliers", warehouse: "Warehouse A", cost: 18000, price: 27500, stock: 12, reorder: 5, image: null },
  { id: "FRN-002", sku: "FRN-002", name: "Maple Dining Table (6-seat)", category: "Dining", material: "Maple Wood", supplier: "Timberline Furnishings", warehouse: "Warehouse A", cost: 15500, price: 23900, stock: 6, reorder: 4, image: null },
  { id: "FRN-003", sku: "FRN-003", name: "Elmwood Queen Bed Frame", category: "Bedroom", material: "Elm Wood", supplier: "WoodCraft Suppliers", warehouse: "Warehouse B", cost: 12000, price: 19500, stock: 3, reorder: 5, image: null },
  { id: "FRN-004", sku: "FRN-004", name: "Cushion Armchair - Grey", category: "Chairs", material: "Fabric & Pine", supplier: "ComfortSeating Co.", warehouse: "Warehouse A", cost: 4200, price: 7500, stock: 20, reorder: 8, image: null },
  { id: "FRN-005", sku: "FRN-005", name: "Glass Top Coffee Table", category: "Tables", material: "Glass & Steel", supplier: "Timberline Furnishings", warehouse: "Warehouse A", cost: 3200, price: 5800, stock: 15, reorder: 6, image: null },
  { id: "FRN-006", sku: "FRN-006", name: "Teakwood Bookshelf 5-Tier", category: "Storage", material: "Teak Wood", supplier: "WoodCraft Suppliers", warehouse: "Warehouse B", cost: 6800, price: 10900, stock: 2, reorder: 4, image: null },
  { id: "FRN-007", sku: "FRN-007", name: "Recliner Sofa - Leather", category: "Sofas", material: "Leather", supplier: "ComfortSeating Co.", warehouse: "Warehouse A", cost: 21000, price: 32000, stock: 4, reorder: 3, image: null },
  { id: "FRN-008", sku: "FRN-008", name: "Wardrobe 3-Door", category: "Bedroom", material: "MDF & Laminate", supplier: "Timberline Furnishings", warehouse: "Warehouse B", cost: 13500, price: 21000, stock: 7, reorder: 5, image: null },
  { id: "FRN-009", sku: "FRN-009", name: "Study Desk with Drawer", category: "Office", material: "Engineered Wood", supplier: "ComfortSeating Co.", warehouse: "Warehouse A", cost: 5200, price: 8900, stock: 0, reorder: 5, image: null },
  { id: "FRN-010", sku: "FRN-010", name: "Outdoor Patio Chair Set (2)", category: "Outdoor", material: "Rattan & Aluminium", supplier: "GreenScape Furniture", warehouse: "Warehouse C", cost: 7600, price: 12500, stock: 10, reorder: 6, image: null },
].map((it) => ({ ...it, avgRgb: mixColor(colorFor(it.category), "#FFFFFF", 0.55) }));

// ============================================================================
// Image helpers
// ============================================================================
function resizeImageFile(file, maxDim = 160, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; } }
        else if (h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
        const canvas = document.getElementById("hiddenCanvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);

        const sc = document.getElementById("hiddenCanvasSmall");
        sc.width = 24; sc.height = 24;
        const sctx = sc.getContext("2d");
        sctx.drawImage(img, 0, 0, 24, 24);
        const data = sctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
        resolve({ dataUrl, avgRgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)] });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function thumbHtml(it, size) {
  size = size || 48;
  if (it.image) return `<img class="thumb" style="width:${size}px;height:${size}px" src="${it.image}" />`;
  const fg = colorFor(it.category);
  return `<div class="thumb-fallback" style="width:${size}px;height:${size}px;background:${fg}22"><div class="dot" style="background:${fg};width:${Math.round(size * 0.4)}px;height:${Math.round(size * 0.4)}px"></div></div>`;
}

// ============================================================================
// QR code generation
// ============================================================================
const qrCache = new Map();
function getQRDataUrl(text, size) {
  size = size || 100;
  const cacheKey = text + ":" + size;
  if (qrCache.has(cacheKey)) return Promise.resolve(qrCache.get(cacheKey));
  return new Promise((resolve) => {
    const holder = document.createElement("div");
    holder.style.display = "none";
    document.body.appendChild(holder);
    try {
      new QRCode(holder, { text: String(text), width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
    } catch (e) {
      document.body.removeChild(holder);
      return resolve(null);
    }
    setTimeout(() => {
      const canvas = holder.querySelector("canvas");
      const img = holder.querySelector("img");
      let dataUrl = null;
      if (canvas) dataUrl = canvas.toDataURL("image/png");
      else if (img && img.src) dataUrl = img.src;
      document.body.removeChild(holder);
      if (dataUrl) qrCache.set(cacheKey, dataUrl);
      resolve(dataUrl);
    }, 60);
  });
}

// ============================================================================
// Firestore mutations. Every write requires isManager (enforced both in the UI,
// by hiding these controls, and for real by the security rules on the server —
// see firestore.rules) so someone can't just open dev tools and edit stock
// without signing in.
// ============================================================================
function itemDocRef(id) { return doc(db, "items", id); }

async function saveItemRemote(item) {
  try {
    await setDoc(itemDocRef(item.id), item);
    return true;
  } catch (e) {
    console.error(e);
    toast(e.code === "permission-denied" ? "Sign in required to save changes" : "Couldn't save — check your connection");
    return false;
  }
}

async function adjustStock(id, delta) {
  const idx = ITEMS.findIndex((it) => it.id === id);
  if (idx === -1) return;
  const updated = { ...ITEMS[idx], stock: Math.max(0, ITEMS[idx].stock + delta) };
  ITEMS[idx] = updated; // optimistic local update — onSnapshot will confirm/correct shortly
  renderGrid();
  await saveItemRemote(updated);
}

async function deleteItemLocal(id) {
  try {
    await deleteDoc(itemDocRef(id));
    confirmDeleteId = null;
    toast("Item deleted");
    // ITEMS/render update arrives via the onSnapshot listener
  } catch (e) {
    console.error(e);
    toast(e.code === "permission-denied" ? "Sign in required to delete" : "Couldn't delete item");
  }
}

// ============================================================================
// Rendering
// ============================================================================
function render() {
  document.getElementById("pageTitle").textContent = mode === "showroom" ? "Browse Inventory" : "Manage Inventory";
  document.getElementById("btnShowroom").classList.toggle("active", mode === "showroom");
  document.getElementById("btnManager").classList.toggle("active", mode === "manager");
  document.getElementById("managerActions").classList.toggle("hidden", mode !== "manager");
  document.getElementById("statsBar").classList.toggle("hidden", mode !== "manager");
  if (mode === "manager") renderStats();
  renderCategoryChips();
  renderGrid();
}

function renderStats() {
  const totalValue = ITEMS.reduce((s, it) => s + it.cost * it.stock, 0);
  const lowCount = ITEMS.filter((it) => it.stock <= it.reorder).length;
  document.getElementById("statsBar").innerHTML = `
    <div class="stat-card"><div class="label">Stock value</div><div class="value">${fmtINR(totalValue)}</div></div>
    <div class="stat-card"><div class="label">Items</div><div class="value">${ITEMS.length}</div></div>
    <div class="stat-card" style="${lowCount ? "border-color:#B8863B" : ""}"><div class="label">Reorder</div><div class="value" style="${lowCount ? "color:#B8863B" : ""}">${lowCount}</div></div>
  `;
}

function renderCategoryChips() {
  const cats = new Set(Object.keys(CATS));
  ITEMS.forEach((it) => cats.add(it.category));
  const all = ["All", ...Array.from(cats)];
  document.getElementById("catChips").innerHTML = all.map((c) =>
    `<button class="chip ${catFilter === c ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`
  ).join("");
}

function getFiltered() {
  const q = query.trim().toLowerCase();
  return ITEMS.filter((it) => {
    const matchQ = !q || [it.name, it.sku, it.supplier, it.material].some((v) => (v || "").toLowerCase().includes(q));
    const matchCat = catFilter === "All" || it.category === catFilter;
    return matchQ && matchCat;
  });
}

function renderGrid() {
  const list = getFiltered();
  if (list.length === 0) {
    document.getElementById("grid").innerHTML = `<div class="empty-state sans">No items match that search.</div>`;
    return;
  }
  document.getElementById("grid").innerHTML = list.map((it) => {
    const s = stockInfo(it);
    const managerRow = mode === "manager" ? `
      <div class="manager-row sans">
        <div class="stock-adjust">
          <button class="icon-btn" data-action="dec" data-id="${esc(it.id)}">−</button>
          <span style="font-size:13px;font-weight:700;min-width:18px;text-align:center;">${it.stock}</span>
          <button class="icon-btn" data-action="inc" data-id="${esc(it.id)}">+</button>
        </div>
        <div style="display:flex;gap:5px;">
          <button class="icon-btn" data-action="edit" data-id="${esc(it.id)}">✎</button>
          ${confirmDeleteId === it.id
            ? `<button class="icon-btn danger" data-action="delete-yes" data-id="${esc(it.id)}">Yes</button><button class="icon-btn" data-action="delete-no">No</button>`
            : `<button class="icon-btn" data-action="delete-ask" data-id="${esc(it.id)}">🗑</button>`}
        </div>
      </div>` : "";
    return `
      <div class="card">
        <div class="card-top">
          ${thumbHtml(it)}
          <div style="min-width:0;flex:1;">
            <div class="item-name">${esc(it.name)}</div>
            <div class="item-meta sans">${esc(it.sku)}</div>
          </div>
        </div>
        <div class="card-bottom sans">
          <span class="price">${fmtINR(it.price)}</span>
          <span class="badge" style="color:${s.color};background:${s.color}1A;">${s.text}</span>
        </div>
        ${managerRow}
      </div>`;
  }).join("");
}

// ============================================================================
// Photo search (color/tone matching)
// ============================================================================
function analyzeUploadedPhoto(dataUrl) {
  document.getElementById("uploadResultWrap").classList.remove("hidden");
  document.getElementById("uploadPreviewImg").src = dataUrl;
  document.getElementById("analysisStatus").textContent = "Analyzing photo…";
  document.getElementById("matchList").innerHTML = "";

  const img = new Image();
  img.onload = () => {
    const canvas = document.getElementById("hiddenCanvasSmall");
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    r /= n; g /= n; b /= n;
    const maxDist = Math.sqrt(255 * 255 * 3);
    const ranked = ITEMS.map((it) => {
      const dist = Math.sqrt((r - it.avgRgb[0]) ** 2 + (g - it.avgRgb[1]) ** 2 + (b - it.avgRgb[2]) ** 2);
      return Object.assign({}, it, { similarity: Math.round((1 - dist / maxDist) * 100) });
    }).sort((a, b2) => b2.similarity - a.similarity);

    document.getElementById("analysisStatus").textContent = "Ranked by closest visual match";
    document.getElementById("matchList").innerHTML = ranked.slice(0, 6).map((it, idx) => {
      const s = stockInfo(it);
      const barColor = idx === 0 ? "#A8562E" : colorFor(it.category);
      return `
        <div class="match-row" style="${idx === 0 ? "border-color:#A8562E" : ""}">
          ${thumbHtml(it, 44)}
          <div style="flex:1;min-width:0;">
            <div style="font-size:13.5px;">${esc(it.name)}</div>
            <div class="sans" style="font-size:11px;color:var(--muted);margin-top:2px;">${esc(it.sku)} · ${fmtINR(it.price)} · <span style="color:${s.color};font-weight:700;">${s.text}</span></div>
            <div class="match-bar-track"><div class="match-bar-fill" style="width:${Math.max(it.similarity, 4)}%;background:${barColor};"></div></div>
          </div>
          <div class="sans" style="font-size:14px;font-weight:700;color:${idx === 0 ? "#A8562E" : "#2B2420"};min-width:40px;text-align:right;">${it.similarity}%</div>
        </div>`;
    }).join("");
  };
  img.src = dataUrl;
}

// ============================================================================
// QR scan
// ============================================================================
function handleQRSearchFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => decodeQRFromDataUrl(e.target.result);
  reader.readAsDataURL(file);
}

function decodeQRFromDataUrl(dataUrl) {
  const wrap = document.getElementById("qrResultWrap");
  wrap.classList.remove("hidden");
  wrap.innerHTML = `<div class="qr-not-found sans">Reading QR code…</div>`;

  const img = new Image();
  img.onload = () => {
    const maxDim = 900;
    let w = img.width, h = img.height;
    if (w > h) { if (w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; } }
    else if (h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
    const canvas = document.getElementById("hiddenCanvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const result = jsQR(imageData.data, w, h);

    if (!result) {
      wrap.innerHTML = `
        <div class="qr-not-found sans">
          <div style="font-size:24px;margin-bottom:8px;">🔍</div>
          <div style="font-weight:600;">No QR code found in that photo</div>
          <div style="font-size:12px;margin-top:4px;">Try again with better lighting and the tag filling more of the frame.</div>
          <button id="btnQRRetry" class="btn" style="margin:14px auto 0;">↺ Try again</button>
        </div>`;
      document.getElementById("btnQRRetry").onclick = resetQRSearch;
      return;
    }

    const decoded = (result.data || "").trim();
    const found = ITEMS.find((it) => it.sku.toLowerCase() === decoded.toLowerCase() || it.id.toLowerCase() === decoded.toLowerCase());

    if (!found) {
      wrap.innerHTML = `
        <div class="qr-not-found sans">
          <div style="font-size:24px;margin-bottom:8px;">❓</div>
          <div style="font-weight:600;">Scanned "${esc(decoded)}" but no matching item</div>
          <button id="btnQRRetry" class="btn" style="margin:14px auto 0;">↺ Scan another</button>
        </div>`;
      document.getElementById("btnQRRetry").onclick = resetQRSearch;
      return;
    }

    const s = stockInfo(found);
    wrap.innerHTML = `
      <div class="qr-found-card">
        ${thumbHtml(found, 60)}
        <div style="flex:1;min-width:0;" class="sans">
          <div style="font-size:14.5px;font-family:Georgia,serif;color:var(--ink);">${esc(found.name)}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:3px;">${esc(found.sku)} · ${esc(found.category)}</div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:7px;">
            <span style="font-size:15px;font-weight:700;">${fmtINR(found.price)}</span>
            <span class="badge" style="color:${s.color};background:${s.color}1A;">${s.text}</span>
          </div>
        </div>
      </div>
      <button id="btnQRRetry" class="btn sans" style="margin-top:12px;">↺ Scan another</button>`;
    document.getElementById("btnQRRetry").onclick = resetQRSearch;
  };
  img.onerror = () => { wrap.innerHTML = `<div class="qr-not-found sans">Couldn't read that image — try again.</div>`; };
  img.src = dataUrl;
}

function resetQRSearch() {
  document.getElementById("qrResultWrap").classList.add("hidden");
  document.getElementById("qrResultWrap").innerHTML = "";
  document.getElementById("qrSearchInput").value = "";
}

// ============================================================================
// Print QR tags
// ============================================================================
async function printQRTags() {
  const list = getFiltered();
  if (list.length === 0) { toast("No items to print"); return; }
  const withQR = await Promise.all(list.map(async (it) => ({ it, qr: await getQRDataUrl(it.sku, 160) })));
  const tagsHtml = withQR.map(({ it, qr }) => `
    <div class="tag">
      <img src="${qr || ""}" />
      <div class="tag-name">${esc(it.name)}</div>
      <div class="tag-sku">${esc(it.sku)}</div>
      <div class="tag-price">${fmtINR(it.price)}</div>
    </div>`).join("");
  const win = window.open("", "_blank");
  if (!win) { toast("Allow pop-ups to print tags"); return; }
  win.document.write(`
    <!DOCTYPE html><html><head><title>QR Tags — Print</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 20px; }
      .tags { display: flex; flex-wrap: wrap; gap: 14px; }
      .tag { width: 150px; border: 1px solid #ccc; border-radius: 8px; padding: 10px; text-align: center; page-break-inside: avoid; }
      .tag img { width: 110px; height: 110px; }
      .tag-name { font-size: 12px; font-weight: 600; margin-top: 6px; min-height: 30px; }
      .tag-sku { font-size: 11px; color: #666; }
      .tag-price { font-size: 13px; font-weight: 700; margin-top: 4px; }
      @media print { body { margin: 0; } }
    </style></head>
    <body><div class="tags">${tagsHtml}</div>
      <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
    </body></html>`);
  win.document.close();
}

// ============================================================================
// Add / edit modal
// ============================================================================
function openAddModal() {
  editingId = null;
  formPhoto = null;
  document.getElementById("modalTitle").textContent = "Add item";
  document.getElementById("btnSubmitForm").textContent = "Add item";
  ["sku", "name", "category", "material", "supplier", "warehouse", "cost", "price", "stock", "reorder"].forEach((k) => {
    document.getElementById("f_" + k).value = "";
  });
  document.getElementById("formPhotoPreview").classList.add("hidden");
  document.getElementById("formPhotoPlaceholder").classList.remove("hidden");
  document.getElementById("photoPickerLabel").textContent = "Add photo";
  document.getElementById("formModal").classList.remove("hidden");
}

function openEditModal(it) {
  editingId = it.id;
  formPhoto = it.image ? { dataUrl: it.image, avgRgb: it.avgRgb } : null;
  document.getElementById("modalTitle").textContent = "Edit item";
  document.getElementById("btnSubmitForm").textContent = "Save changes";
  document.getElementById("f_sku").value = it.sku;
  document.getElementById("f_name").value = it.name;
  document.getElementById("f_category").value = it.category;
  document.getElementById("f_material").value = it.material;
  document.getElementById("f_supplier").value = it.supplier;
  document.getElementById("f_warehouse").value = it.warehouse;
  document.getElementById("f_cost").value = it.cost;
  document.getElementById("f_price").value = it.price;
  document.getElementById("f_stock").value = it.stock;
  document.getElementById("f_reorder").value = it.reorder;
  if (it.image) {
    document.getElementById("formPhotoPreview").src = it.image;
    document.getElementById("formPhotoPreview").classList.remove("hidden");
    document.getElementById("formPhotoPlaceholder").classList.add("hidden");
    document.getElementById("photoPickerLabel").textContent = "Change photo";
  } else {
    document.getElementById("formPhotoPreview").classList.add("hidden");
    document.getElementById("formPhotoPlaceholder").classList.remove("hidden");
    document.getElementById("photoPickerLabel").textContent = "Add photo";
  }
  document.getElementById("formModal").classList.remove("hidden");
}

async function submitForm() {
  const sku = document.getElementById("f_sku").value.trim();
  const name = document.getElementById("f_name").value.trim();
  if (!sku || !name) { toast("SKU and item name are required"); return; }
  if (!editingId && ITEMS.some((it) => it.sku.toLowerCase() === sku.toLowerCase())) {
    toast("An item with that SKU already exists");
    return;
  }
  if (editingId) {
    const clash = ITEMS.find((it) => it.id !== editingId && it.sku.toLowerCase() === sku.toLowerCase());
    if (clash) { toast("Another item already uses that SKU"); return; }
  }
  const category = document.getElementById("f_category").value.trim() || "Other";
  const item = {
    id: editingId || sku,
    sku, name, category,
    material: document.getElementById("f_material").value.trim(),
    supplier: document.getElementById("f_supplier").value.trim(),
    warehouse: document.getElementById("f_warehouse").value.trim(),
    cost: Number(document.getElementById("f_cost").value) || 0,
    price: Number(document.getElementById("f_price").value) || 0,
    stock: Math.max(0, Number(document.getElementById("f_stock").value) || 0),
    reorder: Math.max(0, Number(document.getElementById("f_reorder").value) || 0),
    image: formPhoto ? formPhoto.dataUrl : null,
    avgRgb: formPhoto ? formPhoto.avgRgb : mixColor(colorFor(category), "#FFFFFF", 0.55),
  };
  const ok = await saveItemRemote(item);
  if (ok) {
    document.getElementById("formModal").classList.add("hidden");
    toast(editingId ? "Item updated" : "Item added");
  }
}

// ============================================================================
// JSON backup (safety net — a copy of your data independent of Firebase, in
// case you ever need to restore or migrate. Full fidelity, includes photos.)
// ============================================================================
function todayStamp() { return new Date().toISOString().slice(0, 10); }
function handleJsonExport() {
  const blob = new Blob([JSON.stringify(ITEMS, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `inventory_backup_${todayStamp()}.json`; a.click();
  URL.revokeObjectURL(url);
  toast("Backup ready — save it somewhere safe");
}

// ============================================================================
// Manager login (Firebase Authentication — Email/Password)
// ============================================================================
function openLoginModal(message) {
  document.getElementById("loginMessage").textContent = message ||
    "Staff can browse and search without signing in — this is only needed to add, edit, or adjust stock.";
  document.getElementById("loginError").style.display = "none";
  document.getElementById("loginModal").classList.remove("hidden");
  document.getElementById("loginEmail").focus();
}
function closeLoginModal() { document.getElementById("loginModal").classList.add("hidden"); }

async function tryLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const err = document.getElementById("loginError");
  if (!email || !password) { err.textContent = "Enter your email and password"; err.style.display = "block"; return; }
  err.style.display = "none";
  try {
    await signInWithEmailAndPassword(auth, email, password);
    closeLoginModal();
    mode = "manager";
    render();
    toast("Signed in as manager");
  } catch (e) {
    err.textContent = "Wrong email or password";
    err.style.display = "block";
  }
}

// ============================================================================
// Event wiring
// ============================================================================
document.getElementById("btnShowroom").onclick = () => { mode = "showroom"; render(); };
document.getElementById("btnManager").onclick = () => {
  if (isManager) { mode = "manager"; render(); } else { openLoginModal(); }
};
document.getElementById("btnSignOut").onclick = () => signOut(auth);

document.getElementById("btnCloseLogin").onclick = closeLoginModal;
document.getElementById("loginModal").onclick = (e) => { if (e.target.id === "loginModal") closeLoginModal(); };
document.getElementById("btnLoginSubmit").onclick = tryLogin;
document.getElementById("loginPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });

document.getElementById("btnTextSearch").onclick = () => setSearchType("text");
document.getElementById("btnPhotoSearch").onclick = () => setSearchType("image");
document.getElementById("btnQRSearch").onclick = () => setSearchType("qr");
function setSearchType(type) {
  searchType = type;
  document.getElementById("btnTextSearch").classList.toggle("active", type === "text");
  document.getElementById("btnPhotoSearch").classList.toggle("active", type === "image");
  document.getElementById("btnQRSearch").classList.toggle("active", type === "qr");
  document.getElementById("textSearchPanel").classList.toggle("hidden", type !== "text");
  document.getElementById("photoSearchPanel").classList.toggle("hidden", type !== "image");
  document.getElementById("qrSearchPanel").classList.toggle("hidden", type !== "qr");
}

let searchDebounceTimer = null;
document.getElementById("searchInput").oninput = (e) => {
  query = e.target.value;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(renderGrid, 120);
};
document.getElementById("catChips").onclick = (e) => {
  const btn = e.target.closest("[data-cat]");
  if (!btn) return;
  catFilter = btn.dataset.cat;
  renderCategoryChips(); renderGrid();
};

document.getElementById("grid").onclick = async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (action === "inc" || action === "dec") await adjustStock(id, action === "inc" ? 1 : -1);
  else if (action === "edit") openEditModal(ITEMS.find((it) => it.id === id));
  else if (action === "delete-ask") { confirmDeleteId = id; renderGrid(); }
  else if (action === "delete-no") { confirmDeleteId = null; renderGrid(); }
  else if (action === "delete-yes") await deleteItemLocal(id);
};

document.getElementById("btnAdd").onclick = openAddModal;
document.getElementById("btnCloseModal").onclick = () => document.getElementById("formModal").classList.add("hidden");
document.getElementById("formModal").onclick = (e) => { if (e.target.id === "formModal") e.currentTarget.classList.add("hidden"); };
document.getElementById("btnSubmitForm").onclick = submitForm;

const formImgRef = document.getElementById("formPhotoInput");
document.getElementById("photoPicker").onclick = () => formImgRef.click();
formImgRef.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  formPhoto = await resizeImageFile(file);
  document.getElementById("formPhotoPreview").src = formPhoto.dataUrl;
  document.getElementById("formPhotoPreview").classList.remove("hidden");
  document.getElementById("formPhotoPlaceholder").classList.add("hidden");
  document.getElementById("photoPickerLabel").textContent = "Change photo";
};

document.getElementById("btnExportJson").onclick = handleJsonExport;
document.getElementById("btnPrintTags").onclick = printQRTags;

const dropzone = document.getElementById("dropzone");
dropzone.onclick = () => document.getElementById("photoSearchInput").click();
dropzone.ondragover = (e) => e.preventDefault();
dropzone.ondrop = (e) => { e.preventDefault(); handlePhotoSearchFile(e.dataTransfer.files[0]); };
document.getElementById("photoSearchInput").onchange = (e) => handlePhotoSearchFile(e.target.files[0]);
function handlePhotoSearchFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => analyzeUploadedPhoto(e.target.result);
  reader.readAsDataURL(file);
}
document.getElementById("btnNewPhoto").onclick = () => {
  document.getElementById("uploadResultWrap").classList.add("hidden");
  document.getElementById("photoSearchInput").value = "";
};

const qrDropzone = document.getElementById("qrDropzone");
qrDropzone.onclick = () => document.getElementById("qrSearchInput").click();
document.getElementById("qrSearchInput").onchange = (e) => handleQRSearchFile(e.target.files[0]);

// ============================================================================
// PWA install prompt + online/offline indicator
// ============================================================================
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById("installBanner").classList.remove("hidden");
});
document.getElementById("btnInstall").onclick = async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById("installBanner").classList.add("hidden");
};
window.addEventListener("appinstalled", () => document.getElementById("installBanner").classList.add("hidden"));

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
if (isIos && !isStandalone && !localStorage.getItem("iosInstallHintDismissed")) {
  const banner = document.getElementById("installBanner");
  banner.classList.remove("hidden");
  banner.innerHTML = `<span>On iPhone/iPad: tap the Share button, then "Add to Home Screen".</span>
    <button id="btnDismissIosHint" class="btn" style="flex-shrink:0;">Got it</button>`;
  document.getElementById("btnDismissIosHint").onclick = () => {
    localStorage.setItem("iosInstallHintDismissed", "1");
    banner.classList.add("hidden");
  };
}

function updateOnlineStatus() {
  document.getElementById("offlinePill").classList.toggle("hidden", navigator.onLine);
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.error("Service worker registration failed:", e));
  });
}

// ============================================================================
// Live data subscription + auth state + init
// ============================================================================
let seeded = false;
onSnapshot(collection(db, "items"),
  (snapshot) => {
    if (snapshot.empty && !seeded) {
      seeded = true;
      SEED_ITEMS.forEach((it) => setDoc(doc(db, "items", it.id), it));
      return; // the writes above will re-trigger this listener with real data
    }
    ITEMS = snapshot.docs.map((d) => d.data());
    ITEMS.forEach(ensureAvgRgb);
    render();
  },
  (error) => {
    console.error(error);
    toast("Couldn't connect — check your internet connection");
  }
);

onAuthStateChanged(auth, (user) => {
  isManager = !!user;
  if (!isManager && mode === "manager") mode = "showroom";
  render();
});

updateOnlineStatus();
render();
