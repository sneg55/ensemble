import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractProducts, firstAvailableVariant, lookTotalByStore, groupItemsByStore, catalogSummaryForPrompt } from "../lib/shopify.js";
import { newLook, addItem, removeItem } from "../lib/looks.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/princesspolly-products.json", import.meta.url)));
const origin = "https://us.princesspolly.com";

test("extractProducts maps real catalog rows", () => {
  const products = extractProducts(fixture, origin);
  assert.ok(products.length > 0);
  for (const p of products) {
    assert.equal(p.storeOrigin, origin);
    assert.ok(p.handle);
    assert.ok(p.image.startsWith("https://"));
    assert.ok(p.variants.length > 0);
    assert.ok(p.variants[0].id);
  }
});

test("firstAvailableVariant prefers available", () => {
  const p = { variants: [{ id: 1, available: false }, { id: 2, available: true }] };
  assert.equal(firstAvailableVariant(p).id, 2);
});

test("look add is idempotent per variant and remove works", () => {
  const products = extractProducts(fixture, origin);
  const product = products[0];
  const variant = firstAvailableVariant(product);
  let look = newLook("test");
  look = addItem(look, product, variant);
  look = addItem(look, product, variant);
  assert.equal(look.items.length, 1);
  look = removeItem(look, variant.id);
  assert.equal(look.items.length, 0);
});

test("totals and grouping across stores", () => {
  const items = [
    { storeOrigin: "https://a.com", price: "10.00" },
    { storeOrigin: "https://a.com", price: "5.50" },
    { storeOrigin: "https://b.com", price: "20.00" }
  ];
  const totals = lookTotalByStore(items);
  assert.equal(totals["https://a.com"], 15.5);
  assert.equal(totals["https://b.com"], 20);
  const groups = groupItemsByStore(items);
  assert.equal(groups["https://a.com"].length, 2);
});

test("catalog summary is one line per product", () => {
  const products = extractProducts(fixture, origin);
  const summary = catalogSummaryForPrompt(products, 10);
  assert.equal(summary.split("\n").length, Math.min(10, products.length));
  assert.ok(summary.includes("|"));
});
