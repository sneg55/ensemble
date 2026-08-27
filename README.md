# Ensemble

Compose a purchasable look across Shopify stores. Ensemble is a Chrome extension: browse
any Shopify store, pull its real catalog, mix and match items into one look (from one
store or several), see the look rendered on your own photo, get style suggestions from
the actual inventory, and add every piece to its store's cart in one click.

Checkout stays native per store. Ensemble fills the carts; you finish each one with the
store's own checkout.

Site: https://ensemble-dhf.pages.dev

## Why this is different from try-on extensions

Try-on extensions overlay a product image on your photo and stop there. Ensemble knows
what the item is: the store's live catalog, the exact variant, its price and stock, and
the cart that sells it. A look in Ensemble is purchasable: real variants, a real total,
carts filled across every store involved.

## How it uses WebMCP

Shopify storefronts register native agent tools on `document.modelContext` and
`navigator.modelContext` (`search_catalog`, `get_product`, `update_cart`, `get_cart`,
and others). Ensemble is the agent on the other side of that contract.

`content/mcp-main.js` runs in the page's MAIN world at `document_start`. When the
browser provides the WebMCP API it wraps `modelContext.registerTool` to capture each
tool the storefront registers; when the browser does not, it plants a minimal
`modelContext` shim first, and Shopify's script feature-detects it and registers its
tools anyway. Either way the extension ends up with the store's own tool objects,
serves `listTools` and `callTool` to the isolated world over a `postMessage` bridge
(`content/detect.js`), and routes product lookups and cart adds through the store's
supported surface instead of scraping it.

Storefronts that register nothing fall back to the public catalog and cart endpoints
(`/products.json`, `/cart/add.js`), so the same flows work everywhere; the WebMCP path
is preferred whenever the store offers it.

## Features

- Side panel: your photo, store chips for every Shopify store visited this session,
  auto-loaded catalogs, one look with a running total across stores, Gemini-powered
  style suggestions and try-on renders, add-all-to-carts.
- On-page overlay: hover any product tile for Render on me and Suggest matches; on a
  product page a pill picks up the exact variant you selected, so US 2 on the page is
  US 2 in the cart.
- Cross-store looks: a dress from one catalog, sneakers from another, one total, each
  store's cart filled with exactly those variants.

## Install (developer mode)

1. `chrome://extensions` -> Developer mode -> Load unpacked -> this folder.
2. Open the extension options and paste a Gemini API key (free at
   aistudio.google.com/apikey). It is stored locally and used only for style
   suggestions and try-on renders.
3. Visit any Shopify store. Click the toolbar icon to open the side panel, or hover a
   product tile and use the overlay directly.

To use the native WebMCP API directly, run Chrome with `--enable-features=WebMCP`.
Without the flag the shim path above keeps every feature working on stock Chrome.

## Privacy

Your photo never leaves your machine except inside the render request to Google's
Gemini API, made with your own key. Nothing is stored server-side; there is no server.

## Layout

- `content/mcp-main.js`: MAIN-world WebMCP capture and bridge server
- `content/detect.js`: store detection, bridge client, native-first cart adds
- `content/overlay.js`: shadow-DOM overlay UI on grid tiles and product pages
- `background.js`: service worker, Gemini calls, cross-surface state
- `sidepanel/`, `options/`: panel and settings UI
- `lib/`: catalog parsing, Gemini client, look state, config and error boundaries
- `site/`: the static site deployed to Cloudflare Pages

## Tests

    node --test tests/shopify.test.mjs

The fixture is a real Shopify catalog page (`/products.json`).

## License

MIT, see LICENSE.
