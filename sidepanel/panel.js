import { getConfig, getKnownStores, setLook, setPhoto } from "../lib/config.js";
import { renderLook, suggestMatches } from "../lib/gemini.js";
import { addItem, newLook, removeItem } from "../lib/looks.js";
import {
  catalogSummaryForPrompt,
  extractProducts,
  firstAvailableVariant,
  groupItemsByStore,
  lookTotalByStore
} from "../lib/shopify.js";

const ids = [
  "store-state",
  "hints",
  "photo-preview",
  "photo-remove",
  "photo-input",
  "catalog-section",
  "catalog-search",
  "load-catalog",
  "catalog-grid",
  "look-items",
  "look-total",
  "new-look",
  "suggest",
  "render",
  "add-to-carts",
  "suggestions",
  "renders",
  "status"
];
const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

const state = {
  origin: null,
  catalog: [],
  catalogsByStore: {},
  look: null,
  photo: null,
  apiKey: null
};

async function init() {
  const stored = await getConfig(["look", "photo", "apiKey"]);
  state.look = stored.look || newLook("My look");
  state.photo = stored.photo || null;
  state.apiKey = stored.apiKey || null;
  if (state.photo) showPhoto();
  const { origin } = await chrome.runtime.sendMessage({ type: "activeShopifyOrigin" });
  state.origin = origin;
  const known = Object.keys(await getKnownStores());
  if (origin && !known.includes(origin)) known.push(origin);
  if (known.length) {
    els["store-state"].replaceChildren(
      ...known.map((o) => {
        const btn = document.createElement("button");
        btn.textContent = new URL(o).host;
        btn.className = o === state.origin ? "store active" : "store";
        btn.addEventListener("click", () => {
          state.origin = o;
          state.catalog = state.catalogsByStore[o] || [];
          renderCatalog(visibleCatalog());
          for (const b of els["store-state"].children) {
            b.className = b === btn ? "store active" : "store";
          }
          if (!state.catalog.length) loadCatalog(o);
        });
        return btn;
      })
    );
    els["catalog-section"].hidden = false;
    if (state.origin && !(state.catalogsByStore[state.origin] || []).length) {
      loadCatalog(state.origin);
    }
  } else {
    els["store-state"].textContent = "No Shopify store detected on this tab";
  }
  renderLookSection();
  renderHints();
}

function renderHints() {
  const next = [];
  if (!state.photo) next.push("set your photo");
  if (!state.origin) next.push("open any Shopify store in a tab");
  else if (!state.catalog.length) next.push("load this store's catalog");
  if (!state.apiKey) next.push("add a Gemini key in Options to unlock suggestions and try-on");
  els.hints.textContent = next.length ? `Next: ${next.join(" · ")}` : "";
  els.hints.hidden = !next.length;
}

function showPhoto() {
  els["photo-preview"].src = state.photo;
  els["photo-preview"].hidden = false;
  els["photo-remove"].hidden = false;
}

els["photo-input"].addEventListener("change", () => {
  const file = els["photo-input"].files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    state.photo = reader.result;
    await setPhoto(state.photo);
    showPhoto();
    renderHints();
  };
  reader.readAsDataURL(file);
});

els["photo-remove"].addEventListener("click", async () => {
  state.photo = null;
  await setPhoto(null);
  els["photo-preview"].hidden = true;
  els["photo-remove"].hidden = true;
  renderHints();
});

function visibleCatalog() {
  const q = els["catalog-search"].value.toLowerCase();
  return state.catalog.filter((p) => p.title.toLowerCase().includes(q));
}

async function loadCatalog(origin) {
  await busy(els["load-catalog"], "Loading...", async () => {
    setStatus("Loading catalog...");
    const res = await chrome.runtime.sendMessage({
      type: "panelFetchCatalog",
      origin,
      pages: 2
    });
    if (!res || !res.ok) return setStatus(`Catalog failed: ${(res && res.error) || "no response"}`);
    const products = extractProducts(res.products, origin);
    state.catalogsByStore[origin] = products;
    if (state.origin === origin) {
      state.catalog = products;
      renderCatalog(visibleCatalog());
    }
    setStatus(`${products.length} products loaded`);
    renderHints();
  });
}

els["load-catalog"].addEventListener("click", () => {
  if (state.origin) loadCatalog(state.origin);
});

els["catalog-search"].addEventListener("input", () => renderCatalog(visibleCatalog()));

function inLook(variantId) {
  return state.look.items.some((i) => i.variantId === variantId);
}

function productCard(product, onAction) {
  const variant = firstAvailableVariant(product);
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<img src="${product.image}" alt=""><div class="meta">${product.title}<div class="price">${variant ? variant.price : "?"}</div></div>`;
  const btn = document.createElement("button");
  const already = variant && inLook(variant.id);
  btn.textContent = already ? "✓" : "+";
  btn.disabled = already;
  btn.setAttribute("aria-label", `Add ${product.title} to look`);
  btn.addEventListener("click", async () => {
    await onAction(product, variant);
    btn.textContent = "✓";
    btn.disabled = true;
  });
  card.appendChild(btn);
  return card;
}

function emptyGridNotice(text) {
  const div = document.createElement("div");
  div.className = "grid-empty";
  div.textContent = text;
  return div;
}

function renderCatalog(products) {
  if (!products.length) {
    const notice = state.catalog.length
      ? "No matches in this catalog"
      : "Load the catalog to browse";
    els["catalog-grid"].replaceChildren(emptyGridNotice(notice));
    return;
  }
  const shown = products.slice(0, 60);
  const nodes = shown.map((p) => productCard(p, addToLook));
  if (products.length > shown.length) {
    nodes.push(
      emptyGridNotice(
        `Showing first ${shown.length} of ${products.length} matches, refine your search`
      )
    );
  }
  els["catalog-grid"].replaceChildren(...nodes);
}

async function addToLook(product, variant) {
  state.look = addItem(state.look, product, variant);
  await persistLook();
  renderLookSection();
}

function renderLookSection() {
  els["look-items"].replaceChildren(
    ...state.look.items.map((item) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<img src="${item.image}" alt=""><div class="meta">${item.title}<div class="price">${item.price} · ${new URL(item.storeOrigin).host}</div></div>`;
      const btn = document.createElement("button");
      btn.textContent = "x";
      btn.setAttribute("aria-label", `Remove ${item.title} from look`);
      btn.addEventListener("click", async () => {
        state.look = removeItem(state.look, item.variantId);
        await persistLook();
        renderLookSection();
        renderCatalog(visibleCatalog());
      });
      card.appendChild(btn);
      return card;
    })
  );
  const totals = lookTotalByStore(state.look.items);
  const parts = Object.entries(totals).map(([o, t]) => `${t.toFixed(2)} (${new URL(o).host})`);
  els["look-total"].textContent = state.look.items.length
    ? `${state.look.items.length} item(s): ${parts.join(" + ")}`
    : "";
  els["new-look"].hidden = !state.look.items.length;
}

els["new-look"].addEventListener("click", async () => {
  state.look = newLook("My look");
  await persistLook();
  renderLookSection();
  renderCatalog(visibleCatalog());
  els["suggestions"].replaceChildren();
  setStatus("Started a new look");
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.look || !changes.look.newValue) return;
  state.look = changes.look.newValue;
  renderLookSection();
  renderCatalog(visibleCatalog());
});

function extForDataUrl(dataUrl) {
  const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

async function persistLook() {
  await setLook(state.look);
}

async function busy(button, busyLabel, fn) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    await fn();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

els["suggest"].addEventListener("click", async () => {
  if (!state.apiKey)
    return setStatus("Suggestions need a Gemini API key: set one in the extension Options");
  const pool = Object.values(state.catalogsByStore).flat();
  if (!pool.length) return setStatus("Load a store catalog first, then ask for suggestions");
  await busy(els["suggest"], "Styling...", async () => {
    setStatus("Styling...");
    try {
      const handles = await suggestMatches(
        state.look.items.map((i) => i.title),
        catalogSummaryForPrompt(pool),
        state.apiKey
      );
      const picks = pool.filter((p) => handles.includes(p.handle));
      els["suggestions"].replaceChildren(
        ...(picks.length
          ? picks.map((p) => productCard(p, addToLook))
          : [emptyGridNotice("No matches suggested")])
      );
      setStatus(picks.length ? `${picks.length} suggestion(s)` : "No matches suggested");
    } catch (e) {
      setStatus(String(e));
    }
  });
});

els["render"].addEventListener("click", async () => {
  if (!state.apiKey)
    return setStatus("Try-on renders need a Gemini API key: set one in the extension Options");
  if (!state.photo) return setStatus("Set your photo first");
  if (!state.look.items.length) return setStatus("Add items to the look first");
  await busy(els["render"], "Rendering...", async () => {
    setStatus("Rendering look on you...");
    try {
      const itemImages = await Promise.all(state.look.items.map((i) => toDataUrl(i.image)));
      const rendered = await renderLook(
        state.photo,
        itemImages,
        state.look.items.map((i) => i.title),
        state.apiKey
      );
      const wrap = document.createElement("div");
      wrap.className = "render-card";
      const img = document.createElement("img");
      img.src = rendered;
      const close = document.createElement("button");
      close.textContent = "x";
      close.className = "render-close";
      close.setAttribute("aria-label", "Dismiss this render");
      close.addEventListener("click", () => wrap.remove());
      const save = document.createElement("a");
      save.textContent = "Save";
      save.className = "render-save";
      save.href = rendered;
      save.download = `ensemble-look-${Date.now()}.${extForDataUrl(rendered)}`;
      wrap.append(img, close, save);
      els["renders"].prepend(wrap);
      wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setStatus("Rendered");
    } catch (e) {
      setStatus(String(e));
    }
  });
});

els["add-to-carts"].addEventListener("click", async () => {
  const groups = groupItemsByStore(state.look.items);
  if (!Object.keys(groups).length) return setStatus("Look is empty");
  await busy(els["add-to-carts"], "Adding...", async () => {
    els.status.replaceChildren();
    for (const [origin, items] of Object.entries(groups)) {
      const line = document.createElement("div");
      line.textContent = `${new URL(origin).host}: adding...`;
      els.status.appendChild(line);
      try {
        const res = await chrome.runtime.sendMessage({
          type: "panelAddToCart",
          origin,
          items: items.map((i) => ({
            id: i.variantId,
            quantity: 1,
            handle: i.handle,
            altIds: i.variantIds || []
          }))
        });
        if (res && res.ok) {
          line.textContent = `${new URL(origin).host}: ${items.length} item(s) in cart `;
          const open = document.createElement("a");
          open.textContent = "Open cart";
          open.href = `${origin}/cart`;
          open.target = "_blank";
          open.className = "open-cart";
          line.appendChild(open);
        } else {
          const detail = res
            ? res.error || `${res.status} ${String(res.body || "").slice(0, 120)}`
            : "no response";
          line.textContent = `${new URL(origin).host}: failed (${detail})`;
        }
      } catch (e) {
        line.textContent = `${new URL(origin).host}: failed (${e.message})`;
      }
    }
  });
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

function setStatus(text) {
  els.status.textContent = text;
}

init();
