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
      addViaNativeTools(msg.items)
        .catch(() => addWithFallback(msg.items))
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
    return false;
  });

  let bridgeSeq = 0;
  function bridgeCall(kind, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      const id = `ens-${Date.now()}-${bridgeSeq++}`;
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error(`bridge timeout: ${kind}`));
      }, timeoutMs || 30000);
      function onMessage(event) {
        if (event.source !== window) return;
        const res = event.data;
        if (!res || res.ensembleBridge !== "response" || res.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(res);
      }
      window.addEventListener("message", onMessage);
      window.postMessage({ ensembleBridge: "request", id, kind, ...payload }, location.origin);
    });
  }

  function toVariantGid(id) {
    const s = String(id);
    return s.startsWith("gid://") ? s : `gid://shopify/ProductVariant/${s}`;
  }

  async function callStoreTool(name, args) {
    const res = await bridgeCall("callTool", { name, args });
    if (!res.ok) throw new Error(res.error);
    const result = res.result || {};
    const sc = result.structuredContent || {};
    if (result.isError || sc.error) throw new Error(sc.error || "tool returned an error");
    return sc;
  }

  async function addViaNativeTools(rawItems) {
    const listed = await bridgeCall("listTools", {}, 3000);
    if (!listed.ok || !listed.tools.includes("update_cart")) {
      throw new Error("native store tools unavailable");
    }
    const byVariant = {
      cart: {
        line_items: rawItems.map((i) => ({
          item: { id: toVariantGid(i.id) },
          quantity: i.quantity || 1
        }))
      }
    };
    try {
      const sc = await callStoreTool("update_cart", byVariant);
      return { ok: true, status: 200, body: await nativeCartSummary(sc) };
    } catch {
      const byHandle = {
        cart: {
          line_items: rawItems
            .filter((i) => i.handle)
            .map((i) => ({ handle: i.handle, quantity: i.quantity || 1 }))
        }
      };
      if (!byHandle.cart.line_items.length) throw new Error("no handles for native fallback");
      const sc = await callStoreTool("update_cart", byHandle);
      return { ok: true, status: 200, body: await nativeCartSummary(sc) };
    }
  }

  async function nativeCartSummary(sc) {
    let count = typeof sc.item_count === "number" ? sc.item_count : null;
    if (count === null) {
      try {
        const cart = await callStoreTool("get_cart", {});
        if (typeof cart.item_count === "number") count = cart.item_count;
      } catch {}
    }
    const suffix = sc.deduped ? ", nothing new to add" : "";
    return count === null ? `native: added${suffix}` : `native: cart has ${count} item(s)${suffix}`;
  }

  async function postItems(items) {
    const res = await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ items: items.map((i) => ({ id: i.id, quantity: i.quantity })) })
    });
    return { ok: res.ok, status: res.status, body: (await res.text()).slice(0, 500) };
  }

  async function addWithFallback(rawItems) {
    const items = await resolveAvailable(rawItems);
    const first = await postItems(items);
    if (first.ok || first.status !== 422) return first;
    let added = 0;
    const failures = [];
    for (const item of items) {
      const candidates = [item.id, ...(item.altIds || []).filter((id) => id !== item.id)];
      let landed = false;
      for (const id of candidates) {
        const res = await postItems([{ id, quantity: item.quantity }]);
        if (res.ok) {
          added += 1;
          landed = true;
          break;
        }
        if (res.status !== 422) break;
      }
      if (!landed) failures.push(item.handle || item.id);
    }
    return {
      ok: added > 0 && failures.length === 0,
      status: failures.length ? 422 : 200,
      body: `${added} added${failures.length ? `, sold out: ${failures.join(", ")}` : ""}`
    };
  }

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
