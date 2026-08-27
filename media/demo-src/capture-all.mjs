import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { recordPage } from "testreel";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(__dirname, "..", "..");
const PROFILE = path.join(__dirname, "profile");
const CAPS = path.join(__dirname, "testreel-output");
const KEY = process.env.GEMINI_KEY;
if (!KEY) {
  console.error("GEMINI_KEY not set");
  process.exit(1);
}
fs.mkdirSync(CAPS, { recursive: true });

const ONLY = process.argv[2] || null;
const GRID = "https://us.princesspolly.com/collections/jeans";
const PDP =
  "https://us.princesspolly.com/products/picco-ultra-low-rise-wide-leg-jeans-light-blue-wash";
const STORE2 = "https://www.allbirds.com/collections/womens";
const log = (...a) => console.log("[cap]", ...a);

const CURSOR = { size: 26, color: "#7b1e3a", rippleColor: "#a84563", idleHide: false };
const srFinder = `(() => {
  for (const h of document.querySelectorAll("html > div"))
    if (h.shadowRoot && (h.shadowRoot.querySelector(".pill") || h.shadowRoot.querySelector(".bar"))) return h.shadowRoot
  return null
})`;

async function launch() {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--hide-crash-restore-bubble"
    ],
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: path.join(__dirname, "rawvideo"), size: { width: 1920, height: 1080 } }
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  return { ctx, extId: new URL(sw.url()).host };
}

async function seed(ctx, extId) {
  const photo = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, "assets", "model.png")).toString("base64")}`;
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/sidepanel/panel.html`);
  await p.evaluate(([k, ph]) => chrome.storage.local.set({ apiKey: k, photo: ph }), [KEY, photo]);
  await p.close();
}

function finalize(result, name, trimSec) {
  const outp = path.join(CAPS, `${name}-cap.mp4`);
  fs.rmSync(outp, { force: true });
  if (trimSec > 0.2) {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-ss",
        trimSec.toFixed(2),
        "-i",
        result.video,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "19",
        "-an",
        outp
      ],
      { stdio: "ignore" }
    );
  } else {
    execFileSync(
      "ffmpeg",
      ["-y", "-i", result.video, "-c:v", "libx264", "-preset", "fast", "-crf", "19", "-an", outp],
      { stdio: "ignore" }
    );
  }
  log(name, "->", outp);
}

const frameCss = `
  body { max-width: 640px; margin: 0 auto; padding: 18px 24px; box-shadow: 0 0 0 1px #e7ddd4, 0 30px 80px rgba(60,20,35,.18); min-height: 100vh; }
  html { background: #faf6f1; }
`;

async function capture(name, fn) {
  if (ONLY && ONLY !== name) return;
  log("=== capture:", name);
  const { ctx, extId } = await launch();
  try {
    const t0 = Date.now();
    const page = await ctx.newPage();
    const api = { ctx, extId, page, t0 };
    const { trim = 0, result } = await fn(api);
    finalize(result, name, trim);
  } finally {
    try {
      await ctx.close();
    } catch {}
  }
}

async function dismissConsent(page) {
  for (const label of [
    "Accept All",
    "Accept all",
    "Accept Essentials Only",
    "Accept",
    "I Agree",
    "OK"
  ]) {
    const b = page.locator(`button:has-text("${label}")`).first();
    if (await b.isVisible({ timeout: 500 }).catch(() => false)) {
      await b.click().catch(() => {});
      return;
    }
  }
}

async function stopRec(ctx, page, rec) {
  const realClose = ctx.close.bind(ctx);
  ctx.close = async () => {
    await page.close().catch(() => {});
  };
  try {
    return await rec.stop();
  } finally {
    ctx.close = realClose;
  }
}

const shadowEval = (page, expr) =>
  page.evaluate(`(() => { const sr = ${srFinder}(); return sr ? (${expr}) : null })()`);
const waitShadow = (page, expr, timeout = 120000) =>
  page.waitForFunction(
    `(() => { const sr = ${srFinder}(); return sr ? Boolean(${expr}) : false })()`,
    null,
    { timeout }
  );

async function main() {
  if (!ONLY) {
    fs.rmSync(PROFILE, { recursive: true, force: true });
    fs.rmSync(path.join(__dirname, "rawvideo"), { recursive: true, force: true });
    const { ctx, extId } = await launch();
    await seed(ctx, extId);
    await ctx.close();
    log("seeded key + photo");
  }

  await capture("panel", async ({ ctx, extId, page, t0 }) => {
    const store = await ctx.newPage();
    await store.goto(GRID, { waitUntil: "domcontentloaded", timeout: 60000 });
    await store.waitForTimeout(4000);
    await page.bringToFront();
    await page.goto(`chrome-extension://${extId}/sidepanel/panel.html`);
    await page.addStyleTag({ content: frameCss });
    await page.waitForSelector(".card", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const tStart = (Date.now() - t0) / 1000;
    const rec = await recordPage(page, {
      outputDir: CAPS,
      cursor: CURSOR,
      outputFormat: "mp4",
      videoStartedAt: t0
    });
    await rec.wait(2500);
    await rec.type("#catalog-search", "dress", { delay: 90 });
    await rec.wait(3500);
    const result = await stopRec(ctx, page, rec);
    return { trim: tStart, result };
  });

  await capture("render", async ({ ctx, page, t0 }) => {
    await page.goto(PDP, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(7000);
    const tStart = (Date.now() - t0) / 1000;
    const rec = await recordPage(page, {
      outputDir: CAPS,
      cursor: CURSOR,
      outputFormat: "mp4",
      videoStartedAt: t0
    });
    await rec.wait(1500);
    await rec.click(page.locator('button.product__select-sizes-button:has-text("US 2")').first());
    await page.evaluate(() => {
      const s = document.querySelector('form[action*="/cart/add"] [name="id"]');
      if (s) {
        s.value = "46979967123540";
        s.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await rec.wait(1200);
    await rec.click(".pill button:has-text('Render on me')");
    await waitShadow(page, `sr.querySelector(".modal")`, 10000).catch(() => {});
    await rec.wait(3500);
    const result = await stopRec(ctx, page, rec);
    return { trim: tStart, result };
  });

  await capture("render2", async ({ ctx, page, t0 }) => {
    await page.goto(PDP, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(7000);
    await page.locator('button.product__select-sizes-button:has-text("US 2")').first().click();
    await page.evaluate(() => {
      const s = document.querySelector('form[action*="/cart/add"] [name="id"]');
      if (s) {
        s.value = "46979967123540";
        s.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await page.evaluate(`(() => { const sr = ${srFinder}();
      const b = [...sr.querySelectorAll(".pill button")].find(x => x.textContent === "Render on me"); b && b.click() })()`);
    log("render triggered, waiting for result...");
    await waitShadow(page, `sr.querySelector(".modal img.result")`, 150000);
    await page.waitForTimeout(800);
    const tStart = (Date.now() - t0) / 1000;
    const rec = await recordPage(page, {
      outputDir: CAPS,
      cursor: CURSOR,
      outputFormat: "mp4",
      videoStartedAt: t0
    });
    await rec.wait(4000);
    await rec.click(page.locator(".modal button:has-text('Add to look')").first());
    await rec.wait(2500);
    const result = await stopRec(ctx, page, rec);
    return { trim: tStart, result };
  });

  await capture("suggest", async ({ ctx, page, t0 }) => {
    await page.goto(PDP, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(7000);
    await page
      .locator('button.product__select-sizes-button:has-text("US 2")')
      .first()
      .click()
      .catch(() => {});
    const tStart = (Date.now() - t0) / 1000;
    const rec = await recordPage(page, {
      outputDir: CAPS,
      cursor: CURSOR,
      outputFormat: "mp4",
      videoStartedAt: t0
    });
    await rec.wait(1500);
    await rec.click(".pill button:has-text('Suggest matches')");
    await waitShadow(
      page,
      `[...sr.querySelectorAll(".modal button")].some(b => b.textContent === "Add to look")`,
      90000
    );
    await rec.wait(2500);
    await rec.click(page.locator(".modal button:has-text('Add to look')").first());
    await rec.wait(2500);
    const result = await stopRec(ctx, page, rec);
    return { trim: tStart, result };
  });

  await capture("secondstore", async ({ ctx, extId, page, t0 }) => {
    await page.goto(STORE2, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    await dismissConsent(page);
    const tStart = (Date.now() - t0) / 1000;
    const rec = await recordPage(page, {
      outputDir: CAPS,
      cursor: CURSOR,
      outputFormat: "mp4",
      videoStartedAt: t0
    });
    await rec.wait(3000);
    await rec.navigate(`chrome-extension://${extId}/sidepanel/panel.html`);
    await page.addStyleTag({ content: frameCss });
    await rec.wait(2000);
    await rec.click("text=www.allbirds.com");
    await page.waitForFunction(
      () => document.querySelectorAll("#catalog-grid .card").length > 0,
      null,
      { timeout: 45000 }
    );
    await rec.wait(1500);
    await rec.type("#catalog-search", "runner", { delay: 80 });
    await rec.wait(2000);
    await rec
      .click(page.locator("#catalog-grid .card button").first())
      .catch(() => log("add click failed"));
    await rec.wait(1500);
    await page.evaluate(() =>
      document.getElementById("look-items").scrollIntoView({ behavior: "smooth", block: "center" })
    );
    await rec.wait(3500);
    const result = await stopRec(ctx, page, rec);
    return { trim: tStart, result };
  });

  await capture("carts", async ({ ctx, extId, page, t0 }) => {
    const s1 = await ctx.newPage();
    await s1.goto(PDP, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await s1.waitForTimeout(3000);
    await dismissConsent(s1);
    await s1.evaluate(() => fetch("/cart/clear.js", { method: "POST" })).catch(() => {});
    const s2 = await ctx.newPage();
    await s2
      .goto("https://www.allbirds.com/", { waitUntil: "domcontentloaded", timeout: 60000 })
      .catch(() => {});
    await s2.waitForTimeout(3000);
    await dismissConsent(s2);
    await s2.evaluate(() => fetch("/cart/clear.js", { method: "POST" })).catch(() => {});
    await page.bringToFront();
    await page.goto(`chrome-extension://${extId}/sidepanel/panel.html`);
    await page.addStyleTag({ content: frameCss });
    await page.waitForTimeout(2500);
    await page.evaluate(() =>
      document.getElementById("look-items").scrollIntoView({ behavior: "instant", block: "center" })
    );
    await page.waitForTimeout(500);
    const tStart = (Date.now() - t0) / 1000;
    const rec = await recordPage(page, {
      outputDir: CAPS,
      cursor: CURSOR,
      outputFormat: "mp4",
      videoStartedAt: t0
    });
    await rec.wait(2000);
    await rec.click("button:has-text('Add all to carts')");
    await rec.wait(5500);
    await rec.navigate("https://us.princesspolly.com/cart");
    await rec.wait(4500);
    await rec.navigate("https://www.allbirds.com/cart");
    await rec.wait(4000);
    const result = await stopRec(ctx, page, rec);
    return { trim: tStart, result };
  });

  log("done");
}

await main();
