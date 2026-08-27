const shopifyTabs = new Map();

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "shopifyDetected" && sender.tab) {
    shopifyTabs.set(sender.tab.id, msg.origin);
    chrome.storage.local.get("knownStores").then(({ knownStores }) => {
      chrome.storage.local.set({ knownStores: { ...(knownStores || {}), [msg.origin]: Date.now() } });
    });
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: "ON" });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#7A1F2B" });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => shopifyTabs.delete(tabId));

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

async function tabForOrigin(origin) {
  for (const [tabId, tabOrigin] of shopifyTabs) {
    if (tabOrigin === origin) {
      try {
        await chrome.tabs.get(tabId);
        return tabId;
      } catch {
        shopifyTabs.delete(tabId);
      }
    }
  }
  const tab = await chrome.tabs.create({ url: `${origin}/cart`, active: false });
  await new Promise((resolve) => {
    const listener = (tabId, info) => {
      if (tabId === tab.id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
  await new Promise((r) => setTimeout(r, 800));
  return tab.id;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "panelFetchCatalog") {
    tabForOrigin(msg.origin)
      .then((tabId) => chrome.tabs.sendMessage(tabId, { type: "fetchCatalog", pages: msg.pages }))
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === "panelAddToCart") {
    tabForOrigin(msg.origin)
      .then((tabId) => chrome.tabs.sendMessage(tabId, { type: "addToCart", items: msg.items }))
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === "activeShopifyOrigin") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const active = tab ? shopifyTabs.get(tab.id) : null;
      const fallback = [...shopifyTabs.values()].pop() || null;
      sendResponse({ origin: active || fallback });
    });
    return true;
  }
  return false;
});
