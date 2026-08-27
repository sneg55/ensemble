(async () => {
  if (window.top !== window) return;
  const marker =
    document.querySelector('meta[name="shopify-checkout-api-token"]') ||
    document.querySelector('script[src*="cdn.shopify.com"]') ||
    document.querySelector('link[href*="cdn.shopify.com"]');
  let confirmed = Boolean(marker);
  if (!confirmed) {
    try {
      const res = await fetch("/products.json?limit=1", {
        headers: { Accept: "application/json" }
      });
      confirmed = res.ok && (await res.json()).products !== undefined;
    } catch {
      confirmed = false;
    }
  }
  if (!confirmed) return;
  chrome.runtime.sendMessage({ type: "shopifyDetected", origin: location.origin });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "ping") {
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === "fetchCatalog") {
      fetchAllProducts(msg.pages || 2)
        .then((products) => sendResponse({ ok: true, products }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
    if (msg.type === "addToCart") {
      resolveAvailable(msg.items)
        .then((items) =>
          fetch("/cart/add.js", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ items: items.map((i) => ({ id: i.id, quantity: i.quantity })) })
          })
        )
        .then(async (res) =>
          sendResponse({ ok: res.ok, status: res.status, body: (await res.text()).slice(0, 500) })
        )
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
    return false;
  });

  async function resolveAvailable(items) {
    const resolved = [];
    for (const item of items) {
      if (!item.handle) {
        resolved.push(item);
        continue;
      }
      try {
        const res = await fetch(`/products/${item.handle}.js`, {
          headers: { Accept: "application/json" }
        });
        if (!res.ok) {
          resolved.push(item);
          continue;
        }
        const product = await res.json();
        const chosen = product.variants.find((v) => v.id === item.id);
        if (chosen && chosen.available) {
          resolved.push(item);
        } else {
          const alt = product.variants.find((v) => v.available);
          resolved.push(alt ? { ...item, id: alt.id } : item);
        }
      } catch {
        resolved.push(item);
      }
    }
    return resolved;
  }

  async function fetchAllProducts(pages) {
    const all = [];
    for (let page = 1; page <= pages; page++) {
      const res = await fetch(`/products.json?limit=250&page=${page}`, {
        headers: { Accept: "application/json" }
      });
      if (!res.ok) break;
      const batch = (await res.json()).products || [];
      all.push(...batch);
      if (batch.length < 250) break;
    }
    return { products: all };
  }
})();
