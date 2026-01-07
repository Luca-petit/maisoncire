/* =========================================================
   Maison Cire — app.js (FULL)
   ✅ Includes: Boutique + Panier (singles + packs + giftcards) + Admin + Newsletter
   ✅ Includes: Pack Wizard (Step 1 choose pack, Step 2 compose, then add pack)
   ✅ NEW: Carte Cadeau (live preview + add to cart + remove in cart)
   ========================================================= */

/* ==========
  Storage keys
========== */

const STORAGE_KEY = "candle_shop_products_v2";
const CART_KEY = "candle_shop_cart_v2";
const NEWS_KEY = "candle_shop_newsletter_v1";

/* ==========
  Default data
========== */

const DEFAULT_PRODUCTS = [
  { id: "vanille", name: "Bougie Vanille", price: 18.9, stock: 12, desc: "Douce, chaleureuse, ultra cocooning.", image: "assets/vanille.jpg" },
  { id: "ambre", name: "Bougie Ambre", price: 21.5, stock: 9, desc: "Ambrée et élégante, vibe hôtel.", image: "assets/ambre.jpg" },
  { id: "figue", name: "Bougie Figue", price: 20.0, stock: 7, desc: "Fruité chic, parfait salon.", image: "assets/figue.jpg" },
  { id: "coton", name: "Bougie Coton", price: 17.5, stock: 15, desc: "Propre et légère, effet linge frais.", image: "assets/coton.jpg" },
  { id: "santal", name: "Bougie Santal", price: 22.9, stock: 5, desc: "Boisé premium, très apaisant.", image: "assets/santal.jpg" },
];

const ADMIN_CODE_DEMO = "admin123";

/* ==========
  Helpers
========== */

function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatEUR(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);
}

function clampQty(q) {
  if (!Number.isFinite(q)) return 0;
  return Math.max(0, Math.floor(q));
}

function safeJSON(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

/* ==========
  Products storage
========== */

function loadProducts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(DEFAULT_PRODUCTS);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Bad products");
    return parsed;
  } catch {
    return structuredClone(DEFAULT_PRODUCTS);
  }
}

function saveProducts(products) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

/* ==========
  Cart storage (singles + packs + giftcards)
  cart = {
    skus: { [id]: qty },
    packs: [ {id, name, items, value, free, total} ],
    giftcards: [ {id, amount, color, receiver, sendDate, fromName, message} ]
  }
========== */

function loadCart() {
  const raw = localStorage.getItem(CART_KEY);
  const fallback = { skus: {}, packs: [], giftcards: [] };
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    if (!parsed.skus || typeof parsed.skus !== "object") parsed.skus = {};
    if (!Array.isArray(parsed.packs)) parsed.packs = [];
    if (!Array.isArray(parsed.giftcards)) parsed.giftcards = [];
    return parsed;
  } catch {
    return fallback;
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

/* ==========
  Offers logic (SINGLES)
  - 5 -> 2 free
  - 3 -> 1 free
  Apply: first 5-groups, then 3-groups on remainder
========== */

function computeFreeUnitsSingles(qty) {
  const group5 = Math.floor(qty / 5);
  const rem = qty % 5;
  const group3 = Math.floor(rem / 3);
  return group5 * 2 + group3 * 1;
}

/* ==========
  Offers logic (PACKS) — Mix allowed
  - pack 3 => 1 free
  - pack 5 => 2 free
  Freebies = cheapest units in the pack
========== */

function sumPackUnits(packItems) {
  return packItems.reduce((a, it) => a + it.qty, 0);
}

function computePackTotals(packItems, packSize, products) {
  const freebies = packSize === 5 ? 2 : 1;

  const unitPrices = [];
  let value = 0;

  for (const it of packItems) {
    const p = products.find(x => x.id === it.id);
    if (!p) continue;

    for (let i = 0; i < it.qty; i++) unitPrices.push(p.price);
    value += p.price * it.qty;
  }

  unitPrices.sort((a, b) => a - b);
  const free = unitPrices.slice(0, freebies).reduce((a, b) => a + b, 0);

  return { value, free, total: Math.max(0, value - free) };
}

/* ==========
  Global state
========== */

let products = loadProducts();
let cart = loadCart();        // { skus: {}, packs: [], giftcards: [] }

/* Pack selection state */
let packSelection = {};       // { [id]: qty }
let chosenPackSize = null;    // 3 or 5 (wizard step 1)

/* ==========
  DOM
========== */

const els = {
  year: document.getElementById("year"),

  hamburger: document.getElementById("hamburger"),
  nav: document.getElementById("nav"),

  grid: document.getElementById("productGrid"),

  cartBtn: document.getElementById("cartBtn"),
  cartCount: document.getElementById("cartCount"),
  cartDrawer: document.getElementById("cartDrawer"),
  cartOverlay: document.getElementById("cartOverlay"),
  cartClose: document.getElementById("cartClose"),
  cartItems: document.getElementById("cartItems"),

  subtotal: document.getElementById("subtotal"),
  discount: document.getElementById("discount"),
  total: document.getElementById("total"),
  discountHint: document.getElementById("discountHint"),
  checkoutBtn: document.getElementById("checkoutBtn"),
  clearCartBtn: document.getElementById("clearCartBtn"),
  checkoutMsg: document.getElementById("checkoutMsg"),

  newsletterForm: document.getElementById("newsletterForm"),
  newsletterEmail: document.getElementById("newsletterEmail"),
  newsletterMsg: document.getElementById("newsletterMsg"),

  // Admin
  adminAuth: document.getElementById("adminAuth"),
  adminPanel: document.getElementById("adminPanel"),
  adminCode: document.getElementById("adminCode"),
  adminLogin: document.getElementById("adminLogin"),
  adminMsg: document.getElementById("adminMsg"),
  adminSelect: document.getElementById("adminSelect"),
  adminName: document.getElementById("adminName"),
  adminPrice: document.getElementById("adminPrice"),
  adminStock: document.getElementById("adminStock"),
  adminDesc: document.getElementById("adminDesc"),
  adminSave: document.getElementById("adminSave"),
  adminSaveMsg: document.getElementById("adminSaveMsg"),
  adminReset: document.getElementById("adminReset"),

  // Pack Wizard
  packStep1: document.getElementById("packStep1"),
  packStep2: document.getElementById("packStep2"),
  packChosenText: document.getElementById("packChosenText"),
  packGoStep2: document.getElementById("packGoStep2"),
  packBack: document.getElementById("packBack"),

  packStep2Subtitle: document.getElementById("packStep2Subtitle"),
  packReset: document.getElementById("packReset"),
  packPickGrid: document.getElementById("packPickGrid"),
  packProgress: document.getElementById("packProgress"),
  packPreviewLines: document.getElementById("packPreviewLines"),
  packValue: document.getElementById("packValue"),
  packFree: document.getElementById("packFree"),
  packTotal: document.getElementById("packTotal"),
  packHint: document.getElementById("packHint"),
  addPackBtn: document.getElementById("addPackBtn"),
  packMsg: document.getElementById("packMsg"),

  // Gift Card
  gcPreview: document.getElementById("giftCardPreview"),
  gcPreviewAmount: document.getElementById("gcPreviewAmount"),
  gcPreviewReceiver: document.getElementById("gcPreviewReceiver"),
  gcPreviewDate: document.getElementById("gcPreviewDate"),
  gcPreviewMsg: document.getElementById("gcPreviewMsg"),

  gcAmount: document.getElementById("gcAmount"),
  gcColor: document.getElementById("gcColor"),
  gcReceiverEmail: document.getElementById("gcReceiverEmail"),
  gcSendDate: document.getElementById("gcSendDate"),
  gcFromName: document.getElementById("gcFromName"),
  gcMessage: document.getElementById("gcMessage"),
  gcAddToCart: document.getElementById("gcAddToCart"),
  gcReset: document.getElementById("gcReset"),
  gcMsg: document.getElementById("gcMsg"),
  gcCustomWrap: document.getElementById("gcCustomWrap"),
  gcCustomAmount: document.getElementById("gcCustomAmount"),

};

if (els.year) els.year.textContent = new Date().getFullYear();

/* ==========
  Utilities
========== */

function getProduct(id) {
  return products.find(p => p.id === id);
}

function totalCartCount() {
  const skusCount = Object.values(cart.skus).reduce((a, b) => a + b, 0);
  const packsCount = (cart.packs || []).length;
  const giftCount = (cart.giftcards || []).length;
  return skusCount + packsCount + giftCount;
}

function toast(msg) {
  if (!els.checkoutMsg) return;
  els.checkoutMsg.textContent = msg;
}

/* ==========
  Pack Wizard helpers
========== */

function currentPackSize() {
  return Number(chosenPackSize || 3);
}

function showPackStep(step) {
  if (!els.packStep1 || !els.packStep2) return;
  if (step === 1) {
    els.packStep1.classList.remove("hidden");
    els.packStep2.classList.add("hidden");
  } else {
    els.packStep1.classList.add("hidden");
    els.packStep2.classList.remove("hidden");
  }
}

function updatePackChosenUI() {
  if (!els.packChosenText || !els.packGoStep2) return;

  if (!chosenPackSize) {
    els.packChosenText.textContent = "Aucun pack sélectionné.";
    els.packGoStep2.disabled = true;
    return;
  }

  els.packChosenText.textContent = chosenPackSize === 3
    ? "Pack sélectionné : Pack 3 (1 offerte)"
    : "Pack sélectionné : Pack 5 (2 offertes)";

  els.packGoStep2.disabled = false;

  if (els.packStep2Subtitle) {
    els.packStep2Subtitle.textContent = chosenPackSize === 3
      ? "Choisis 3 bougies (la moins chère est offerte)."
      : "Choisis 5 bougies (les 2 moins chères sont offertes).";
  }
}

function selectPackType(size) {
  chosenPackSize = Number(size);
  packSelection = {};
  if (els.packMsg) els.packMsg.textContent = "";

  document.querySelectorAll(".packTypeCard").forEach(btn => {
    btn.classList.toggle("is-selected", Number(btn.dataset.packtype) === chosenPackSize);
  });

  updatePackChosenUI();
}

/* ==========
  Render products (with images)
========== */

function renderProducts() {
  if (!els.grid) return;

  els.grid.innerHTML = "";

  for (const p of products) {
    const inStock = p.stock > 0;
    const badge = inStock ? `${p.stock} en stock` : "Rupture";
    const btnLabel = inStock ? "Ajouter" : "Indisponible";

    const card = document.createElement("article");
    card.className = "card";

    const img = p.image ? `<img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" loading="lazy" />` : "";

    card.innerHTML = `
      <div class="productMedia">
        ${img}
        <div class="productMedia__overlay"></div>
        <div class="productMedia__top">
          <span class="badge ${inStock ? "" : "badge--out"}">${badge}</span>
        </div>
      </div>

      <div class="productBody">
        <div>
          <h3>${escapeHTML(p.name)}</h3>
          <p>${escapeHTML(p.desc)}</p>
        </div>

        <div class="productFooter">
          <span class="price">${formatEUR(p.price)}</span>
          <button class="btn btn--ghost" data-add="${p.id}" ${inStock ? "" : "disabled"}>
            ${btnLabel}
          </button>
        </div>
      </div>
    `;

    els.grid.appendChild(card);
  }
}

/* ==========
  Cart logic (singles)
========== */

function addToCart(productId, qty = 1) {
  const p = getProduct(productId);
  if (!p) return;

  const current = cart.skus[productId] || 0;
  const next = clampQty(current + qty);

  if (next > p.stock) {
    toast(`Stock insuffisant pour “${p.name}”`);
    return;
  }

  cart.skus[productId] = next;
  saveCart(cart);

  if (els.cartBtn) {
    els.cartBtn.classList.remove("bump");
    void els.cartBtn.offsetWidth;
    els.cartBtn.classList.add("bump");
  }

  const btn = document.querySelector(`[data-add="${productId}"]`);
  const card = btn?.closest(".card");
  if (card) {
    card.classList.remove("flash");
    void card.offsetWidth;
    card.classList.add("flash");
  }

  renderCartBadge();
  renderCart();
}

function setCartQty(productId, qty) {
  const p = getProduct(productId);
  if (!p) return;

  const q = clampQty(qty);

  if (q === 0) {
    delete cart.skus[productId];
  } else {
    if (q > p.stock) {
      toast(`Stock insuffisant pour “${p.name}”`);
      return;
    }
    cart.skus[productId] = q;
  }

  saveCart(cart);
  renderCartBadge();
  renderCart();
}

function clearCart() {
  cart = { skus: {}, packs: [], giftcards: [] };
  saveCart(cart);
  renderCartBadge();
  renderCart();
}

/* ==========
  Drawer open/close
========== */

function openCart() {
  if (!els.cartDrawer) return;
  els.cartDrawer.classList.add("open");
  els.cartDrawer.setAttribute("aria-hidden", "false");
  if (els.checkoutMsg) els.checkoutMsg.textContent = "";
}

function closeCart() {
  if (!els.cartDrawer) return;
  els.cartDrawer.classList.remove("open");
  els.cartDrawer.setAttribute("aria-hidden", "true");
}

/* ==========
  Totals (singles + packs + giftcards)
========== */

function computeTotals() {
  let subtotal = 0;
  let discount = 0;
  const hintParts = [];

  // Singles
  for (const [id, qty] of Object.entries(cart.skus)) {
    const p = getProduct(id);
    if (!p) continue;

    subtotal += p.price * qty;

    const free = computeFreeUnitsSingles(qty);
    const saved = free * p.price;
    discount += saved;

    if (free > 0) hintParts.push(`${free} offerte(s) sur “${p.name}”`);
  }

  // Packs
  for (const pack of (cart.packs || [])) {
    subtotal += pack.value || 0;
    discount += pack.free || 0;
    hintParts.push(`${pack.name} (offert ${formatEUR(pack.free || 0)})`);
  }

  // Gift Cards (no promo)
  for (const gc of (cart.giftcards || [])) {
    subtotal += Number(gc.amount || 0);
    hintParts.push(`Carte cadeau ${formatEUR(gc.amount || 0)}`);
  }

  const total = Math.max(0, subtotal - discount);
  return { subtotal, discount, total, hint: hintParts.join(" · ") };
}

/* ==========
  Render cart (singles + packs + giftcards)
========== */

function renderCartBadge() {
  if (!els.cartCount) return;
  els.cartCount.textContent = totalCartCount();
}

function formatDateFR(yyyyMmDd) {
  if (!yyyyMmDd) return "—";
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function renderCart() {
  if (!els.cartItems) return;

  els.cartItems.innerHTML = "";

  const skuEntries = Object.entries(cart.skus);
  const packEntries = cart.packs || [];
  const giftEntries = cart.giftcards || [];
  const empty = skuEntries.length === 0 && packEntries.length === 0 && giftEntries.length === 0;

  if (empty) {
    els.cartItems.innerHTML = `<p class="muted">Votre panier est vide.</p>`;
  } else {
    // Singles
    for (const [id, qty] of skuEntries) {
      const p = getProduct(id);
      if (!p) continue;

      const free = computeFreeUnitsSingles(qty);
      const payable = qty - free;

      const item = document.createElement("div");
      item.className = "cartItem";
      item.innerHTML = `
        <div>
          <h4>${escapeHTML(p.name)}</h4>
          <p>${qty} unité(s) · ${free} offerte(s) → ${payable} payée(s)</p>
          <p>${formatEUR(p.price)} / unité</p>
        </div>
        <div class="qty" aria-label="Quantité">
          <button data-dec="${id}" aria-label="Diminuer">−</button>
          <span>${qty}</span>
          <button data-inc="${id}" aria-label="Augmenter">+</button>
        </div>
      `;
      els.cartItems.appendChild(item);
    }

    // Packs
    for (const pack of packEntries) {
      const lines = (pack.items || [])
        .map(it => {
          const p = getProduct(it.id);
          return `${p?.name || it.id} ×${it.qty}`;
        })
        .join(" · ");

      const item = document.createElement("div");
      item.className = "cartItem";
      item.innerHTML = `
        <div>
          <h4>${escapeHTML(pack.name || "Pack")}</h4>
          <p>${escapeHTML(lines || "")}</p>
          <p>Valeur ${formatEUR(pack.value || 0)} · Offert ${formatEUR(pack.free || 0)}</p>
        </div>
        <div class="qty">
          <button data-pack-remove="${escapeHTML(pack.id)}" aria-label="Supprimer">🗑️</button>
        </div>
      `;
      els.cartItems.appendChild(item);
    }

    // Gift Cards
    for (const gc of giftEntries) {
      const parts = [
        `Receveur : ${gc.receiver || ""}`,
        `Date d’envoi : ${gc.sendDate ? formatDateFR(gc.sendDate) : "—"}`,
        gc.fromName ? `De : ${gc.fromName}` : null,
        gc.message ? `Message : ${gc.message}` : null,
      ].filter(Boolean);

      const item = document.createElement("div");
      item.className = "cartItem";
      item.innerHTML = `
        <div>
          <h4>Carte cadeau — ${formatEUR(gc.amount || 0)}</h4>
          <p>${escapeHTML(parts.join(" · "))}</p>
          <p>Couleur : ${escapeHTML(gc.color || "violet")}</p>
        </div>
        <div class="qty">
          <button data-gc-remove="${escapeHTML(gc.id)}" aria-label="Supprimer">🗑️</button>
        </div>
      `;
      els.cartItems.appendChild(item);
    }
  }

  const t = computeTotals();
  if (els.subtotal) els.subtotal.textContent = formatEUR(t.subtotal);
  if (els.discount) els.discount.textContent = `- ${formatEUR(t.discount)}`;
  if (els.total) els.total.textContent = formatEUR(t.total);
  if (els.discountHint) els.discountHint.textContent = t.hint ? `Promos : ${t.hint}` : "Aucune promo appliquée.";
}

/* ==========
  Pack Builder (Step 2)
========== */

function packItemsArray() {
  return Object.entries(packSelection)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ id, qty }));
}

function renderPackPicker() {
  if (!els.packPickGrid) return;

  els.packPickGrid.innerHTML = "";
  const size = currentPackSize();
  const units = Object.values(packSelection).reduce((a, b) => a + b, 0);

  for (const p of products) {
    const qty = packSelection[p.id] || 0;

    const card = document.createElement("div");
    card.className = "packPick";

    const img = p.image ? `<img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" loading="lazy" />` : "";

    card.innerHTML = `
      <div class="packPick__media">${img}</div>
      <div class="packPick__body">
        <div class="packPick__title">
          <div>
            <h4>${escapeHTML(p.name)}</h4>
            <p>${formatEUR(p.price)} · Stock ${p.stock}</p>
          </div>
          <span class="badge">${qty}x</span>
        </div>

        <div class="packPick__actions">
          <div class="counter">
            <button data-pack-dec="${p.id}" aria-label="Diminuer">−</button>
            <span>${qty}</span>
            <button data-pack-inc="${p.id}" aria-label="Augmenter">+</button>
          </div>

          <button class="btn btn--ghost" data-pack-addone="${p.id}">
            +1
          </button>
        </div>
      </div>
    `;

    const btnInc = card.querySelector(`[data-pack-inc="${p.id}"]`);
    const btnAddOne = card.querySelector(`[data-pack-addone="${p.id}"]`);
    const btnDec = card.querySelector(`[data-pack-dec="${p.id}"]`);

    const packFull = units >= size;
    if (btnInc) btnInc.disabled = packFull || qty >= p.stock;
    if (btnAddOne) btnAddOne.disabled = packFull || qty >= p.stock;
    if (btnDec) btnDec.disabled = qty <= 0;

    els.packPickGrid.appendChild(card);
  }

  renderPackPreview();
}

function renderPackPreview() {
  if (!els.packPreviewLines) return;

  const size = currentPackSize();
  const items = packItemsArray();
  const units = sumPackUnits(items);

  if (els.packProgress) els.packProgress.textContent = `${units} / ${size}`;

  if (units === 0) {
    els.packPreviewLines.innerHTML = `<p class="muted">Sélectionne des bougies pour composer ton pack.</p>`;
  } else {
    els.packPreviewLines.innerHTML = items
      .map(it => {
        const p = getProduct(it.id);
        const linePrice = p ? p.price * it.qty : 0;
        return `
          <div class="packLine">
            <span>${escapeHTML(p?.name || it.id)} <strong>×${it.qty}</strong></span>
            <span>${formatEUR(linePrice)}</span>
          </div>
        `;
      })
      .join("");
  }

  const isComplete = units === size;
  const totals = isComplete ? computePackTotals(items, size, products) : { value: 0, free: 0, total: 0 };

  if (els.packValue) els.packValue.textContent = formatEUR(totals.value);
  if (els.packFree) els.packFree.textContent = `- ${formatEUR(totals.free)}`;
  if (els.packTotal) els.packTotal.textContent = formatEUR(totals.total);

  if (els.addPackBtn) els.addPackBtn.disabled = !isComplete;

  if (els.packHint) {
    if (!isComplete) {
      const remaining = Math.max(0, size - units);
      els.packHint.textContent = remaining === 0 ? "" : `Ajoute encore ${remaining} bougie(s) pour compléter le pack.`;
    } else {
      els.packHint.textContent = size === 3
        ? "Offert : la bougie la moins chère du pack."
        : "Offert : les 2 bougies les moins chères du pack.";
    }
  }
}

function addPackToCart() {
  const size = currentPackSize();
  const items = packItemsArray();
  const units = sumPackUnits(items);

  if (units !== size) return;

  for (const it of items) {
    const p = getProduct(it.id);
    if (!p) return;
    if (it.qty > p.stock) {
      if (els.packMsg) els.packMsg.textContent = `Stock insuffisant pour “${p.name}”.`;
      setTimeout(() => { if (els.packMsg) els.packMsg.textContent = ""; }, 2000);
      return;
    }
  }

  const totals = computePackTotals(items, size, products);

  const packId = `pack_${Date.now()}`;
  const packName = size === 3 ? "Pack 3 (1 offerte)" : "Pack 5 (2 offertes)";

  cart.packs.push({
    id: packId,
    name: packName,
    items,
    value: Math.round((totals.value || 0) * 100) / 100,
    free: Math.round((totals.free || 0) * 100) / 100,
    total: Math.round((totals.total || 0) * 100) / 100
  });

  // Reserve stock immediately for the pack
  for (const it of items) {
    const p = getProduct(it.id);
    if (p) p.stock = Math.max(0, p.stock - it.qty);
  }
  saveProducts(products);

  saveCart(cart);
  renderProducts();
  renderCartBadge();
  renderCart();

  packSelection = {};
  renderPackPicker();

  if (els.packMsg) {
    els.packMsg.textContent = "Pack ajouté au panier ✅";
    setTimeout(() => (els.packMsg.textContent = ""), 2200);
  }

  if (els.cartBtn) {
    els.cartBtn.classList.remove("bump");
    void els.cartBtn.offsetWidth;
    els.cartBtn.classList.add("bump");
  }
}

/* ==========
  Gift Card (live preview + add to cart)
========== */

function getGiftCardAmount() {
  const v = (els.gcAmount?.value || "50").trim();
  if (v === "custom") {
    const n = Number(els.gcCustomAmount?.value || 0);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function updateCustomAmountUI() {
  const isCustom = (els.gcAmount?.value || "") === "custom";
  if (els.gcCustomWrap) els.gcCustomWrap.style.display = isCustom ? "" : "none";
  if (!isCustom && els.gcCustomAmount) els.gcCustomAmount.value = "";
}


function gcSetMsg(text) {
  if (!els.gcMsg) return;
  els.gcMsg.textContent = text;
  clearTimeout(gcSetMsg._t);
  gcSetMsg._t = setTimeout(() => (els.gcMsg.textContent = ""), 2600);
}

function renderGiftCardPreview() {
  if (!els.gcPreview) return;

  updateCustomAmountUI();
  const amount = getGiftCardAmount() || 50;
  const color = (els.gcColor?.value || "violet").trim();
  const receiver = (els.gcReceiverEmail?.value || "receveur@email.com").trim();
  const sendDate = formatDateFR(els.gcSendDate?.value || "");
  const fromName = (els.gcFromName?.value || "").trim();
  const msgRaw = (els.gcMessage?.value || "").trim();

  const msg = msgRaw
    ? (fromName ? `De ${fromName} — ${msgRaw}` : msgRaw)
    : "Un petit mot… (optionnel)";

  els.gcPreview.dataset.color = color;

  if (els.gcPreviewAmount) els.gcPreviewAmount.textContent = `${amount} €`;
  if (els.gcPreviewReceiver) els.gcPreviewReceiver.textContent = receiver || "receveur@email.com";
  if (els.gcPreviewDate) els.gcPreviewDate.textContent = sendDate;
  if (els.gcPreviewMsg) els.gcPreviewMsg.textContent = msg;
}

function addGiftCardToCart() {
  updateCustomAmountUI();
  const amount = getGiftCardAmount();
  const color = (els.gcColor?.value || "violet").trim();
  const receiver = (els.gcReceiverEmail?.value || "").trim().toLowerCase();
  const sendDateRaw = (els.gcSendDate?.value || "").trim();
  const fromName = (els.gcFromName?.value || "").trim();
  const message = (els.gcMessage?.value || "").trim();

  if (!amount || amount <= 0) return gcSetMsg("Montant invalide.");
  if (!receiver || !receiver.includes("@")) return gcSetMsg("Email du receveur invalide.");

  const item = {
    id: `gc_${Date.now()}`,
    amount: Math.round(amount * 100) / 100,
    color,
    receiver,
    sendDate: sendDateRaw || "",
    fromName,
    message
  };

  if (!Array.isArray(cart.giftcards)) cart.giftcards = [];
  cart.giftcards.push(item);

  saveCart(cart);
  renderCartBadge();
  renderCart();

  if (els.cartBtn) {
    els.cartBtn.classList.remove("bump");
    void els.cartBtn.offsetWidth;
    els.cartBtn.classList.add("bump");
  }

  gcSetMsg("Carte cadeau ajoutée au panier ✅");
}

function resetGiftCardForm() {
  if (els.gcAmount) els.gcAmount.value = "50";
  if (els.gcColor) els.gcColor.value = "violet";
  if (els.gcReceiverEmail) els.gcReceiverEmail.value = "";
  if (els.gcSendDate) els.gcSendDate.value = "";
  if (els.gcFromName) els.gcFromName.value = "";
  if (els.gcMessage) els.gcMessage.value = "";
  renderGiftCardPreview();
  gcSetMsg("Réinitialisé.");


}

/* ==========
  Admin (front-only)
========== */

function msg(el, text) {
  if (!el) return;
  el.textContent = text;
  clearTimeout(msg._t);
  msg._t = setTimeout(() => (el.textContent = ""), 2800);
}

function renderAdminSelect() {
  if (!els.adminSelect) return;
  els.adminSelect.innerHTML = "";

  for (const p of products) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    els.adminSelect.appendChild(opt);
  }
}

function loadAdminFields(productId) {
  const p = getProduct(productId);
  if (!p) return;
  if (els.adminName) els.adminName.value = p.name;
  if (els.adminPrice) els.adminPrice.value = p.price;
  if (els.adminStock) els.adminStock.value = p.stock;
  if (els.adminDesc) els.adminDesc.value = p.desc;
}

function saveAdminFields(productId) {
  const p = getProduct(productId);
  if (!p) return;

  const nextName = (els.adminName?.value || "").trim();
  const nextPrice = Number(els.adminPrice?.value);
  const nextStock = Number(els.adminStock?.value);
  const nextDesc = (els.adminDesc?.value || "").trim();

  if (!nextName) return msg(els.adminSaveMsg, "Nom invalide.");
  if (!Number.isFinite(nextPrice) || nextPrice < 0) return msg(els.adminSaveMsg, "Prix invalide.");
  if (!Number.isFinite(nextStock) || nextStock < 0) return msg(els.adminSaveMsg, "Stock invalide.");

  p.name = nextName;
  p.price = Math.round(nextPrice * 100) / 100;
  p.stock = Math.floor(nextStock);
  p.desc = nextDesc;

  // Clamp single cart qty
  if (cart.skus[p.id] && cart.skus[p.id] > p.stock) {
    cart.skus[p.id] = p.stock;
    if (cart.skus[p.id] === 0) delete cart.skus[p.id];
    saveCart(cart);
  }

  saveProducts(products);
  renderProducts();
  renderCart();
  renderAdminSelect();
  if (els.adminSelect) els.adminSelect.value = p.id;

  msg(els.adminSaveMsg, "Sauvegardé ✅");
}

/* ==========
  Newsletter (demo)
========== */

function saveNewsletterEmail(email) {
  const raw = localStorage.getItem(NEWS_KEY);
  const list = raw ? safeJSON(raw, []) : [];
  if (!list.includes(email)) list.push(email);
  localStorage.setItem(NEWS_KEY, JSON.stringify(list));
}

/* ==========
  Global click handler
========== */

document.addEventListener("click", (e) => {

  // 🎁 Gift card color swatches
  const sw = e.target?.closest?.("[data-gc-color]");
  if (sw) {
    const color = sw.dataset.gcColor;
    if (els.gcColor) els.gcColor.value = color;

    document.querySelectorAll(".swatch").forEach(b => {
      const isSel = b.dataset.gcColor === color;
      b.classList.toggle("is-selected", isSel);
      b.setAttribute("aria-checked", String(isSel));
    });

    renderGiftCardPreview();
    return;
  }

// Pack type select (Step 1)
  const pt = e.target?.closest?.(".packTypeCard")?.dataset?.packtype;
  if (pt) {
    selectPackType(pt);
    return;
  }

  // Add single
  const addId = e.target?.dataset?.add;
  if (addId) {
    addToCart(addId, 1);
    return;
  }

  // Single qty
  const incId = e.target?.dataset?.inc;
  if (incId) {
    setCartQty(incId, (cart.skus[incId] || 0) + 1);
    return;
  }

  const decId = e.target?.dataset?.dec;
  if (decId) {
    setCartQty(decId, (cart.skus[decId] || 0) - 1);
    return;
  }

  // Remove pack
  const rmPack = e.target?.dataset?.packRemove;
  if (rmPack) {
    // Restore stock
    const pack = (cart.packs || []).find(p => p.id === rmPack);
    if (pack) {
      for (const it of (pack.items || [])) {
        const prod = getProduct(it.id);
        if (prod) prod.stock += it.qty;
      }
      saveProducts(products);
      renderProducts();
    }

    cart.packs = (cart.packs || []).filter(p => p.id !== rmPack);
    saveCart(cart);
    renderCartBadge();
    renderCart();
    return;
  }

  // Remove gift card
  const rmGc = e.target?.dataset?.gcRemove;
  if (rmGc) {
    cart.giftcards = (cart.giftcards || []).filter(x => x.id !== rmGc);
    saveCart(cart);
    renderCartBadge();
    renderCart();
    return;
  }

  // Pack Builder controls (Step 2)
  const inc = e.target?.dataset?.packInc;
  const dec = e.target?.dataset?.packDec;
  const addOne = e.target?.dataset?.packAddone;
  const id = inc || dec || addOne;

  if (id) {
    const size = currentPackSize();
    const units = Object.values(packSelection).reduce((a, b) => a + b, 0);
    const current = packSelection[id] || 0;
    const p = getProduct(id);
    if (!p) return;

    if (inc || addOne) {
      if (units >= size) return;
      if (current + 1 > p.stock) {
        if (els.packMsg) els.packMsg.textContent = "Stock insuffisant pour cette bougie.";
        setTimeout(() => { if (els.packMsg) els.packMsg.textContent = ""; }, 2000);
        return;
      }
      packSelection[id] = current + 1;
    } else if (dec) {
      const next = Math.max(0, current - 1);
      if (next === 0) delete packSelection[id];
      else packSelection[id] = next;
    }

    renderPackPicker();
  }
});

/* ==========
  Bindings
========== */

if (els.cartBtn) els.cartBtn.addEventListener("click", openCart);
if (els.cartClose) els.cartClose.addEventListener("click", closeCart);
if (els.cartOverlay) els.cartOverlay.addEventListener("click", closeCart);

if (els.clearCartBtn) {
  els.clearCartBtn.addEventListener("click", () => {
    clearCart();
    toast("Panier vidé.");
  });
}

if (els.checkoutBtn) {
  els.checkoutBtn.addEventListener("click", () => {
    const t = computeTotals();
    if (totalCartCount() === 0) {
      toast("Ajoute au moins une bougie 🙂");
      return;
    }
    toast(`Panier validé (démo). Total: ${formatEUR(t.total)}. Remise: ${formatEUR(t.discount)}.`);
  });
}

if (els.hamburger) {
  els.hamburger.addEventListener("click", () => {
    if (!els.nav) return;
    const isOpen = els.nav.classList.toggle("open");
    els.hamburger.setAttribute("aria-expanded", String(isOpen));
  });
}

if (els.newsletterForm) {
  els.newsletterForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = (els.newsletterEmail?.value || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      if (els.newsletterMsg) els.newsletterMsg.textContent = "Email invalide.";
      return;
    }
    saveNewsletterEmail(email);
    if (els.newsletterEmail) els.newsletterEmail.value = "";
    if (els.newsletterMsg) {
      els.newsletterMsg.textContent = "Inscription enregistrée ✅ (démo)";
      setTimeout(() => (els.newsletterMsg.textContent = ""), 2800);
    }
  });
}

// Admin auth
if (els.adminLogin) {
  els.adminLogin.addEventListener("click", () => {
    const code = (els.adminCode?.value || "").trim();
    if (code !== ADMIN_CODE_DEMO) {
      if (els.adminMsg) els.adminMsg.textContent = "Code invalide.";
      setTimeout(() => { if (els.adminMsg) els.adminMsg.textContent = ""; }, 2000);
      return;
    }
    if (els.adminAuth) els.adminAuth.classList.add("hidden");
    if (els.adminPanel) els.adminPanel.classList.remove("hidden");
    if (els.adminMsg) els.adminMsg.textContent = "";
  });
}

if (els.adminSelect) {
  els.adminSelect.addEventListener("change", () => {
    loadAdminFields(els.adminSelect.value);
    if (els.adminSaveMsg) els.adminSaveMsg.textContent = "";
  });
}

if (els.adminSave) {
  els.adminSave.addEventListener("click", () => {
    if (!els.adminSelect) return;
    saveAdminFields(els.adminSelect.value);
  });
}

if (els.adminReset) {
  els.adminReset.addEventListener("click", () => {
    products = structuredClone(DEFAULT_PRODUCTS);
    cart = { skus: {}, packs: [], giftcards: [] };
    packSelection = {};
    chosenPackSize = null;

    saveProducts(products);
    saveCart(cart);

    renderProducts();
    renderCart();
    renderCartBadge();
    renderAdminSelect();

    if (products[0] && els.adminSelect) {
      els.adminSelect.value = products[0].id;
      loadAdminFields(products[0].id);
    }

    // Pack wizard back to step 1
    document.querySelectorAll(".packTypeCard").forEach(btn => btn.classList.remove("is-selected"));
    updatePackChosenUI();
    showPackStep(1);

    msg(els.adminSaveMsg, "Reset effectué ✅");
  });
}

/* Pack Wizard bindings */
if (els.packGoStep2) {
  els.packGoStep2.addEventListener("click", () => {
    if (!chosenPackSize) return;
    showPackStep(2);
    renderPackPicker();
    els.packStep2?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

if (els.packBack) {
  els.packBack.addEventListener("click", () => {
    showPackStep(1);
  });
}

if (els.packReset) {
  els.packReset.addEventListener("click", () => {
    packSelection = {};
    if (els.packMsg) els.packMsg.textContent = "";
    renderPackPicker();
  });
}

if (els.addPackBtn) {
  els.addPackBtn.addEventListener("click", addPackToCart);
}

/* Gift Card bindings */
["input", "change"].forEach(evt => {
  // ⚠️ on enlève gcAmount d’ici (on le gère à part juste après)
  // els.gcAmount?.addEventListener(evt, renderGiftCardPreview);

  els.gcColor?.addEventListener(evt, renderGiftCardPreview);
  els.gcReceiverEmail?.addEventListener(evt, renderGiftCardPreview);
  els.gcSendDate?.addEventListener(evt, renderGiftCardPreview);
  els.gcFromName?.addEventListener(evt, renderGiftCardPreview);
  els.gcMessage?.addEventListener(evt, renderGiftCardPreview);
});

/* ✅ Montant : on gère le "custom" proprement */
els.gcAmount?.addEventListener("change", () => {
  updateCustomAmountUI();
  renderGiftCardPreview();
  if ((els.gcAmount?.value || "") === "custom") {
    els.gcCustomAmount?.focus();
  }
});

/* ✅ Montant personnalisé : update en direct quand tu tapes */
els.gcCustomAmount?.addEventListener("input", renderGiftCardPreview);

if (els.gcAddToCart) els.gcAddToCart.addEventListener("click", addGiftCardToCart);
if (els.gcReset) els.gcReset.addEventListener("click", resetGiftCardForm);


/* ==========
  Init
========== */

function init() {
  if (!localStorage.getItem(STORAGE_KEY)) saveProducts(products);
  if (!localStorage.getItem(CART_KEY)) saveCart(cart);

  renderProducts();
  renderCartBadge();
  renderCart();

  renderAdminSelect();
  if (products[0] && els.adminSelect) {
    els.adminSelect.value = products[0].id;
    loadAdminFields(products[0].id);
  }

  // Pack wizard init
  showPackStep(1);
  updatePackChosenUI();

  // Gift card init
  renderGiftCardPreview();
}

init();
