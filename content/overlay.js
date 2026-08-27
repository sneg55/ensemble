(() => {
  if (window.top !== window) return;

  const start = () => {
    const host = document.createElement("div");
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647;";
    const root = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);

    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", sans-serif; }
      .bar { position: fixed; display: none; gap: 6px; padding: 6px; background: rgba(20,20,20,0.85);
        border-radius: 8px; z-index: 10; }
      .bar.on { display: flex; }
      .bar button, .pill button { border: 0; border-radius: 6px; padding: 6px 10px; font-size: 12px;
        background: #7a1f2b; color: #fff; cursor: pointer; white-space: nowrap; }
      .bar button:hover, .pill button:hover { background: #99303e; }
      .pill { position: fixed; right: 16px; bottom: 16px; display: none; gap: 6px; padding: 8px;
        background: rgba(20,20,20,0.9); border-radius: 10px; align-items: center; }
      .pill.on { display: flex; }
      .pill .brand { color: #fff; font-size: 12px; font-weight: 600; padding: 0 4px; }
      .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: none;
        align-items: center; justify-content: center; }
      .backdrop.on { display: flex; }
      .modal { background: #fff; color: #1c1c1c; border-radius: 12px; width: min(560px, 92vw);
        max-height: 86vh; overflow: auto; padding: 16px; position: relative; }
      .modal h2 { margin: 0 24px 10px 0; font-size: 15px; }
      .modal .close { position: absolute; top: 10px; right: 10px; background: #eee; color: #333;
        border: 0; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; }
      .modal img.result { max-width: 100%; border-radius: 8px; display: block; margin: 0 auto; }
      .modal .row { display: flex; gap: 8px; margin-top: 12px; justify-content: center; }
      .modal .row button, .modal .row a { border: 0; border-radius: 6px; padding: 8px 14px;
        font-size: 13px; background: #7a1f2b; color: #fff; cursor: pointer; text-decoration: none; }
      .modal .msg { font-size: 13px; color: #555; padding: 18px 4px; text-align: center; }
      .spin { width: 26px; height: 26px; border: 3px solid #ddd; border-top-color: #7a1f2b;
        border-radius: 50%; margin: 22px auto; animation: sp 0.8s linear infinite; }
      @keyframes sp { to { transform: rotate(360deg); } }
      .sugs { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
      .sug { border: 1px solid #e5e5e5; border-radius: 8px; padding: 8px; text-align: center; }
      .sug img { width: 100%; height: 120px; object-fit: cover; border-radius: 6px; }
      .sug .t { font-size: 12px; margin: 6px 0; }
      .sug .p { font-size: 12px; color: #666; margin-bottom: 6px; }
      .sug button { border: 0; border-radius: 6px; padding: 5px 10px; font-size: 12px;
        background: #7a1f2b; color: #fff; cursor: pointer; }
    `;
    root.appendChild(style);

    const bar = document.createElement("div");
    bar.className = "bar";
    const pill = document.createElement("div");
    pill.className = "pill";
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const modal = document.createElement("div");
    modal.className = "modal";
    backdrop.appendChild(modal);
    root.append(bar, pill, backdrop);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });

    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape" || !backdrop.classList.contains("on")) return;
        e.stopPropagation();
        closeModal();
      },
      true
    );

    let current = null;

    function openModal(title) {
      modal.replaceChildren();
      const h = document.createElement("h2");
      h.textContent = title;
      const close = document.createElement("button");
      close.className = "close";
      close.textContent = "×";
      close.addEventListener("click", closeModal);
      modal.append(h, close);
      backdrop.classList.add("on");
      return modal;
    }

    function closeModal() {
      backdrop.classList.remove("on");
      modal.replaceChildren();
    }

    function showSpinner() {
      const s = document.createElement("div");
      s.className = "spin";
      modal.appendChild(s);
      return s;
    }

    function showMsg(text) {
      const d = document.createElement("div");
      d.className = "msg";
      d.textContent = text;
      modal.appendChild(d);
    }

    async function runRender(item) {
      openModal(`Render on me: ${item.title}`);
      const s = showSpinner();
      try {
        const res = await chrome.runtime.sendMessage({
          type: "overlayRender",
          origin: location.origin,
          title: item.title,
          imageUrl: item.image
        });
        s.remove();
        if (!res || !res.ok) return showMsg(errorText(res));
        const img = document.createElement("img");
        img.className = "result";
        img.src = res.image;
        const row = document.createElement("div");
        row.className = "row";
        const add = document.createElement("button");
        add.textContent = "Add to look";
        add.addEventListener("click", () => addToLook(add, item));
        const save = document.createElement("a");
        save.textContent = "Save";
        save.href = res.image;
        save.download = `ensemble-${item.handle}.${extForDataUrl(res.image)}`;
        row.append(add, save);
        modal.append(img, row);
      } catch (e) {
        s.remove();
        showMsg(String(e));
      }
    }

    async function runSuggest(item) {
      openModal(`Goes with: ${item.title}`);
      const s = showSpinner();
      try {
        const res = await chrome.runtime.sendMessage({
          type: "overlaySuggest",
          origin: location.origin,
          seedTitle: item.title
        });
        s.remove();
        if (!res || !res.ok) return showMsg(errorText(res));
        if (!res.suggestions.length) return showMsg("No suggestions for this item.");
        const grid = document.createElement("div");
        grid.className = "sugs";
        for (const sug of res.suggestions) {
          const card = document.createElement("div");
          card.className = "sug";
          const img = document.createElement("img");
          img.src = sug.image || "";
          const t = document.createElement("div");
          t.className = "t";
          t.textContent = sug.title;
          const p = document.createElement("div");
          p.className = "p";
          p.textContent = sug.price || "";
          const add = document.createElement("button");
          add.textContent = "Add to look";
          add.addEventListener("click", () =>
            addToLook(add, { handle: sug.handle, title: sug.title, image: sug.image })
          );
          card.append(img, t, p, add);
          grid.appendChild(card);
        }
        modal.appendChild(grid);
      } catch (e) {
        s.remove();
        showMsg(String(e));
      }
    }

    function withSelectedVariant(item) {
      const detailHandle = handleFromHref(location.pathname);
      if (!detailHandle || detailHandle !== item.handle) return item;
      const fromUrl = new URLSearchParams(location.search).get("variant");
      const formField =
        document.querySelector('form[action*="/cart/add"] [name="id"]') ||
        document.querySelector('[name="id"]');
      const variantId = fromUrl || (formField && formField.value) || null;
      return variantId ? { ...item, variantId } : item;
    }

    async function addToLook(button, item) {
      const chosen = withSelectedVariant(item);
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Adding...";
      try {
        const res = await chrome.runtime.sendMessage({
          type: "overlayAddToLook",
          origin: location.origin,
          handle: chosen.handle,
          variantId: chosen.variantId || null,
          fallbackImage: chosen.image
        });
        if (res && res.ok) {
          button.textContent = `In look (${res.count})`;
          panelLinkRow();
        } else {
          button.textContent = errorText(res).slice(0, 40);
          button.disabled = false;
        }
      } catch (e) {
        button.textContent = String(e).slice(0, 40);
        button.disabled = false;
      }
      if (button.textContent === "Adding...") button.textContent = original;
    }

    function extForDataUrl(dataUrl) {
      const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
      if (mime === "image/jpeg") return "jpg";
      if (mime === "image/webp") return "webp";
      return "png";
    }

    function panelLinkRow() {
      if (modal.querySelector(".panel-link")) return;
      const row = document.createElement("div");
      row.className = "row panel-link";
      const open = document.createElement("button");
      open.textContent = "Open Ensemble panel";
      open.addEventListener("click", async () => {
        const res = await chrome.runtime.sendMessage({ type: "openSidePanel" });
        if (!res || !res.ok) {
          const note = document.createElement("div");
          note.className = "msg";
          note.textContent =
            "Open the Ensemble side panel from the puzzle-piece toolbar menu to see your look.";
          row.replaceWith(note);
        }
      });
      row.appendChild(open);
      modal.appendChild(row);
    }

    function errorText(res) {
      if (!res) return "No response from the extension.";
      if (res.error === "no-key")
        return "Set a Gemini API key in the Ensemble extension Options first.";
      if (res.error === "no-photo") return "Add your photo in the Ensemble side panel first.";
      return res.error || "Something went wrong.";
    }

    function makeButtons(container) {
      const render = document.createElement("button");
      render.textContent = "Render on me";
      render.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (current) runRender(withSelectedVariant(current));
      });
      const suggest = document.createElement("button");
      suggest.textContent = "Suggest matches";
      suggest.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (current) runSuggest(current);
      });
      container.append(render, suggest);
    }

    makeButtons(bar);

    const handleFromHref = (href) => {
      const m = /\/products\/([a-z0-9-]+)/i.exec(href || "");
      return m ? m[1] : null;
    };

    let hideTimer = null;

    function cardFromEvent(target) {
      const targetImg = target instanceof HTMLImageElement ? target : null;
      let cur = target;
      for (let depth = 0; cur && cur !== document.body && depth < 7; depth++) {
        const anchors = [...cur.querySelectorAll('a[href*="/products/"]')];
        const enclosing = cur.closest ? cur.closest('a[href*="/products/"]') : null;
        if (enclosing) anchors.push(enclosing);
        const handles = new Set(
          anchors.map((a) => handleFromHref(a.getAttribute("href"))).filter(Boolean)
        );
        if (handles.size > 1) return null;
        if (handles.size === 1) {
          const rect = cur.getBoundingClientRect();
          const img = targetImg || cur.querySelector("img");
          if (rect.width >= 80 && rect.height >= 80 && img && img.src) {
            const handle = [...handles][0];
            return {
              handle,
              title: (img.alt || anchors[0].textContent || handle).trim().slice(0, 120),
              image: img.src,
              rect: img.getBoundingClientRect()
            };
          }
        }
        cur = cur.parentElement;
      }
      return null;
    }

    document.addEventListener(
      "mouseover",
      (e) => {
        if (!(e.target instanceof Element)) return;
        if (e.target === host) {
          clearTimeout(hideTimer);
          return;
        }
        const card = cardFromEvent(e.target);
        if (!card) {
          clearTimeout(hideTimer);
          hideTimer = setTimeout(() => bar.classList.remove("on"), 350);
          return;
        }
        current = { handle: card.handle, title: card.title, image: card.image };
        clearTimeout(hideTimer);
        bar.style.left = `${Math.max(4, card.rect.left + 6)}px`;
        bar.style.top = `${Math.max(4, card.rect.top + 6)}px`;
        bar.classList.add("on");
      },
      true
    );

    bar.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    bar.addEventListener("mouseleave", () => {
      hideTimer = setTimeout(() => bar.classList.remove("on"), 400);
    });

    const detailHandle = handleFromHref(location.pathname);
    if (detailHandle) {
      const og = document.querySelector('meta[property="og:image"]');
      const titleMeta = document.querySelector('meta[property="og:title"]');
      const item = {
        handle: detailHandle,
        title: (titleMeta?.content || document.title).slice(0, 120),
        image:
          og?.content || document.querySelector('img[src*="/products/"], main img')?.src || null
      };
      if (item.image) {
        const brand = document.createElement("span");
        brand.className = "brand";
        brand.textContent = "Ensemble";
        pill.appendChild(brand);
        const detailButtons = document.createElement("span");
        detailButtons.style.display = "flex";
        detailButtons.style.gap = "6px";
        makeButtons(detailButtons);
        pill.appendChild(detailButtons);
        pill.addEventListener("mouseenter", () => {
          current = item;
        });
        pill.classList.add("on");
        current = item;
      }
    }
  };

  if (globalThis.ensembleShopConfirmed) start();
  else window.addEventListener("ensemble:shopify", start, { once: true });
})();
