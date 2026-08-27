import { getConfig, setLook, setPhoto } from "../lib/config.js";
import { renderLook, suggestMatches } from "../lib/gemini.js";
import { addItem, newLook, removeItem } from "../lib/looks.js";
import {
  catalogSummaryForPrompt,
  extractProducts,
  firstAvailableVariant,
  groupItemsByStore,
  lookTotalByStore
} from "../lib/shopify.js";

const els = Object.fromEntries(
  [
    "store-state",
    "photo-preview",
    "photo-input",
    "catalog-section",
    "catalog-search",
    "load-catalog",
    "catalog-grid",
    "look-items",
    "look-total",
    "suggest",
    "render",
    "add-to-carts",
    "suggestions",
    "renders",
    "status"
  ].map((id) => [id, document.getElementById(id)])
);

const state = { origin: null, catalog: [], look: null, photo: null, apiKey: null };

async function init() {
  const stored = await getConfig(["look", "photo", "apiKey"]);
  state.look = stored.look || newLook("My look");
  state.photo = stored.photo || null;
  state.apiKey = stored.apiKey || null;
  if (state.photo) showPhoto();
  const { origin } = await chrome.runtime.sendMessage({ type: "activeShopifyOrigin" });
  state.origin = origin;
  if (origin) {
    els["store-state"].textContent = new URL(origin).host;
    els["catalog-section"].hidden = false;
  }
  renderLookSection();
}

function showPhoto() {
  els["photo-preview"].src = state.photo;
  els["photo-preview"].hidden = false;
}

els["photo-input"].addEventListener("change", () => {
  const file = els["photo-input"].files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    state.photo = reader.result;
    await setPhoto(state.photo);
    showPhoto();
  };
  reader.readAsDataURL(file);
});

els["load-catalog"].addEventListener("click", async () => {
  setStatus("Loading catalog...");
  const res = await chrome.runtime.sendMessage({
    type: "panelFetchCatalog",
    origin: state.origin,
    pages: 2
  });
  if (!res || !res.ok) return setStatus(`Catalog failed: ${(res && res.error) || "no response"}`);
  state.catalog = extractProducts(res.products, state.origin);
  setStatus(`${state.catalog.length} products loaded`);
  renderCatalog(state.catalog.slice(0, 60));
});

els["catalog-search"].addEventListener("input", () => {
  const q = els["catalog-search"].value.toLowerCase();
  renderCatalog(state.catalog.filter((p) => p.title.toLowerCase().includes(q)).slice(0, 60));
});

function productCard(product, actionLabel, onAction) {
  const variant = firstAvailableVariant(product);
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<img src="${product.image}" alt=""><div class="meta">${product.title}<div class="price">$${variant ? variant.price : "?"}</div></div>`;
  const btn = document.createElement("button");
  btn.textContent = actionLabel;
  btn.addEventListener("click", () => onAction(product, variant));
  card.appendChild(btn);
  return card;
}

function renderCatalog(products) {
  els["catalog-grid"].replaceChildren(
    ...products.map((p) =>
      productCard(p, "+", async (product, variant) => {
        state.look = addItem(state.look, product, variant);
        await persistLook();
        renderLookSection();
      })
    )
  );
}

function renderLookSection() {
  els["look-items"].replaceChildren(
    ...state.look.items.map((item) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<img src="${item.image}" alt=""><div class="meta">${item.title}<div class="price">$${item.price} · ${new URL(item.storeOrigin).host}</div></div>`;
      const btn = document.createElement("button");
      btn.textContent = "x";
      btn.addEventListener("click", async () => {
        state.look = removeItem(state.look, item.variantId);
        await persistLook();
        renderLookSection();
      });
      card.appendChild(btn);
      return card;
    })
  );
  const totals = lookTotalByStore(state.look.items);
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  els["look-total"].textContent = state.look.items.length
    ? `$${grand.toFixed(2)} across ${Object.keys(totals).length} store(s)`
    : "";
}

async function persistLook() {
  await setLook(state.look);
}

els["suggest"].addEventListener("click", async () => {
  if (!requireKey() || !state.catalog.length) return setStatus("Load a catalog first");
  setStatus("Styling...");
  try {
    const handles = await suggestMatches(
      state.look.items.map((i) => i.title),
      catalogSummaryForPrompt(state.catalog),
      state.apiKey
    );
    const picks = state.catalog.filter((p) => handles.includes(p.handle));
    els["suggestions"].replaceChildren(
      ...picks.map((p) =>
        productCard(p, "+", async (product, variant) => {
          state.look = addItem(state.look, product, variant);
          await persistLook();
          renderLookSection();
        })
      )
    );
    setStatus(picks.length ? `${picks.length} suggestion(s)` : "No matches suggested");
  } catch (e) {
    setStatus(String(e));
  }
});

els["render"].addEventListener("click", async () => {
  if (!requireKey()) return;
  if (!state.photo) return setStatus("Set your photo first");
  if (!state.look.items.length) return setStatus("Add items to the look first");
  setStatus("Rendering look on you...");
  try {
    const itemImages = await Promise.all(state.look.items.map((i) => toDataUrl(i.image)));
    const rendered = await renderLook(
      state.photo,
      itemImages,
      state.look.items.map((i) => i.title),
      state.apiKey
    );
    const img = document.createElement("img");
    img.src = rendered;
    els["renders"].prepend(img);
    setStatus("Rendered");
  } catch (e) {
    setStatus(String(e));
  }
});

els["add-to-carts"].addEventListener("click", async () => {
  const groups = groupItemsByStore(state.look.items);
  if (!Object.keys(groups).length) return setStatus("Look is empty");
  const lines = [];
  setStatus("Adding to carts...");
  for (const [origin, items] of Object.entries(groups)) {
    let line;
    try {
      const res = await chrome.runtime.sendMessage({
        type: "panelAddToCart",
        origin,
        items: items.map((i) => ({ id: i.variantId, quantity: 1 }))
      });
      if (res && res.ok) {
        line = `${new URL(origin).host}: ${items.length} item(s) in cart`;
      } else {
        const detail = res
          ? res.error || `${res.status} ${String(res.body || "").slice(0, 120)}`
          : "no response";
        line = `${new URL(origin).host}: failed (${detail})`;
      }
    } catch (e) {
      line = `${new URL(origin).host}: failed (${e.message})`;
    }
    lines.push(line);
    setStatus(lines.join("\n"));
  }
});

async function toDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function requireKey() {
  if (!state.apiKey) {
    setStatus("Set your Gemini API key in the extension options first");
    return false;
  }
  return true;
}

function setStatus(text) {
  els["status"].textContent = text;
}

init();
