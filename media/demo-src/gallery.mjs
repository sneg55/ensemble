import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.HOME + "/Downloads";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const scene of ["hero", "onpage", "look", "carts", "tools"]) {
  await page.goto(`file://${__dirname}/gallery.html?scene=${scene}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/ensemble-gallery-${scene}.png` });
  console.log(scene);
}
await browser.close();
