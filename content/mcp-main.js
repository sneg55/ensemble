(() => {
  if (window.top !== window) return;
  const registry = new Map();

  const capture = (tool) => {
    if (tool && typeof tool.name === "string" && typeof tool.execute === "function") {
      registry.set(tool.name, tool);
    }
  };

  const attach = (target) => {
    const existing = target.modelContext;
    if (existing && typeof existing.registerTool === "function") {
      const original = existing.registerTool.bind(existing);
      try {
        existing.registerTool = (tool) => {
          capture(tool);
          return original(tool);
        };
      } catch {}
      return;
    }
    if (!existing) {
      const shim = {
        registerTool(tool) {
          capture(tool);
          return {
            unregister() {
              if (tool && tool.name) registry.delete(tool.name);
            }
          };
        },
        provideContext() {}
      };
      try {
        Object.defineProperty(target, "modelContext", { value: shim, configurable: true });
      } catch {}
    }
  };

  attach(document);
  attach(navigator);

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.ensembleBridge !== "request" || typeof msg.id !== "string") return;
    const reply = (payload) => {
      window.postMessage({ ensembleBridge: "response", id: msg.id, ...payload }, location.origin);
    };
    if (msg.kind === "listTools") {
      reply({ ok: true, tools: [...registry.keys()] });
      return;
    }
    if (msg.kind === "callTool") {
      const tool = registry.get(msg.name);
      if (!tool) {
        reply({ ok: false, error: `no registered tool: ${msg.name}` });
        return;
      }
      try {
        const raw = await tool.execute(msg.args || {});
        const result = typeof raw === "string" ? JSON.parse(raw) : raw;
        reply({ ok: true, result });
      } catch (e) {
        reply({ ok: false, error: String(e) });
      }
    }
  });
})();
