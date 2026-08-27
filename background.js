import {
  getApiKey,
  getKnownStores,
  getLook,
  getPhoto,
  recordKnownStore,
  setLook
} from "./lib/config.js";
import { renderLook, suggestMatches } from "./lib/gemini.js";
import { addItem, newLook } from "./lib/looks.js";
import {
  catalogSummaryForPrompt,
  extractProducts,
  firstAvailableVariant,
  productFromNative
} from "./lib/shopify.js";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "shopifyDetected" && sender.tab) {
    recordKnownStore(msg.origin);
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: "ON" });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#7A1F2B" });
    return false;
  }
  if (msg.type === "panelFetchCatalog") {
    relayToStore(msg.origin, { type: "fetchCatalog", pages: msg.pages })
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === "panelAddToCart") {
    relayToStore(msg.origin, { type: "addToCart", items: msg.items })
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === "overlayRender") {
    overlayRender(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === "overlaySuggest") {
    overlaySuggest(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === "overlayAddToLook") {
    overlayAddToLook(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === "activeShopifyOrigin") {
    resolveActiveOrigin().then((origin) => sendResponse({ origin }));
    return true;
  }
  return false;
});

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

async function resolveActiveOrigin() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const known = await getKnownStores();
  if (tab && tab.url) {
    try {
      const origin = new URL(tab.url).origin;
      if (known[origin]) return origin;
    } catch {
      return null;
    }
  }
  const byRecency = Object.entries(known).sort((a, b) => b[1] - a[1]);
  return byRecency.length ? byRecency[0][0] : null;
}

async function ping(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "ping" });
    return Boolean(res && res.ok);
  } catch {
    return false;
  }
}

async function relayToStore(origin, message) {
  const tabId = await storeTab(origin);
  return chrome.tabs.sendMessage(tabId, message);
}

async function storeTab(origin) {
  const tabs = await chrome.tabs.query({ url: `${origin}/*` });
  for (const tab of tabs) {
    if (await ping(tab.id)) return tab.id;
  }
  const created = await chrome.tabs.create({ url: `${origin}/cart`, active: false });
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await ping(created.id)) return created.id;
  }
  throw new Error(`no responding tab for ${origin}`);
}

async function fetchAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const blob = await res.blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

async function overlayRender(msg) {
  const apiKey = await getApiKey();
  if (!apiKey) return { ok: false, error: "no-key" };
  const photo = await getPhoto();
  if (!photo) return { ok: false, error: "no-photo" };
  const itemImage = await fetchAsDataUrl(msg.imageUrl);
  const image = await renderLook(photo, [itemImage], [msg.title], apiKey);
  return { ok: true, image };
}

async function overlaySuggest(msg) {
  const apiKey = await getApiKey();
  if (!apiKey) return { ok: false, error: "no-key" };
  const res = await relayToStore(msg.origin, { type: "fetchCatalog", pages: 2 });
  if (!res || !res.ok) return { ok: false, error: "could not load the store catalog" };
  const products = extractProducts(res.products, msg.origin);
  const handles = await suggestMatches([msg.seedTitle], catalogSummaryForPrompt(products), apiKey);
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const suggestions = handles
    .map((h) => byHandle.get(h))
    .filter(Boolean)
    .filter((p) => p.title !== msg.seedTitle)
    .map((p) => {
      const v = firstAvailableVariant(p);
      return { handle: p.handle, title: p.title, image: p.image, price: v ? v.price : "" };
    });
  return { ok: true, suggestions };
}

async function overlayAddToLook(msg) {
  const res = await relayToStore(msg.origin, {
    type: "storeTool",
    name: "get_product",
    args: { catalog: { id: msg.handle } }
  });
  let product = null;
  if (res && res.ok && res.sc) {
    product = productFromNative(res.sc, msg.origin, msg.fallbackImage);
  } else {
    const cat = await relayToStore(msg.origin, { type: "fetchCatalog", pages: 2 });
    if (cat && cat.ok) {
      product = extractProducts(cat.products, msg.origin).find((p) => p.handle === msg.handle);
    }
  }
  if (!product || !product.variants.length) {
    return { ok: false, error: "could not resolve the product" };
  }
  const variant = firstAvailableVariant(product);
  const look = (await getLook()) || newLook("My look");
  const updated = addItem(look, product, variant);
  await setLook(updated);
  return { ok: true, count: updated.items.length };
}
