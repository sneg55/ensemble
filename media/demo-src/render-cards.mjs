// Renders each card/term scene from scenes.json to a 1920x1080 PNG in out/cards/.
// No network, no key. UI scenes (kind: "ui") are skipped; testreel supplies those.

import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, "scenes.json"), "utf8"));
const OUT = path.join(__dirname, "out", "cards");
fs.mkdirSync(OUT, { recursive: true });
const stageUrl = "file://" + path.join(__dirname, "cards", "stage.html");

const cards = scenes.filter((s) => s.kind === "card" || s.kind === "term");
console.log(`Rendering ${cards.length} card/term scenes...`);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1
});
try {
  await page.goto(stageUrl, { waitUntil: "load" });
  for (const scene of cards) {
    await page.evaluate((s) => window.__show(s), scene);
    await page.waitForTimeout(250);
    const dest = path.join(OUT, `${scene.id}.png`);
    await page.screenshot({ path: dest, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    console.log(`  ${scene.id} -> ${path.relative(__dirname, dest)}`);
  }
} catch (e) {
  console.error("render-cards failed:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
