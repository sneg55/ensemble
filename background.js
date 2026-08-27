import { getKnownStores, recordKnownStore } from "./lib/config.js";

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
