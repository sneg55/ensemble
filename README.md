# Ensemble

Compose a purchasable look across Shopify stores. Ensemble is a Chrome extension: browse
any Shopify store, pull its real catalog, mix and match items into one look (from one
store or several), see the look rendered on your own photo, get style suggestions from
the actual inventory, and add every piece to its store's cart in one click.

Checkout stays native per store. Ensemble fills the carts; you finish each one with the
store's own checkout (V2 explores tighter checkout flows).

## Why this is different from try-on extensions

Try-on extensions overlay a product image on your photo and stop there. Ensemble knows
what the item is: the store's live catalog (`/products.json`), the exact variant, its
price and stock, and the same-origin cart API (`/cart/add.js`). A look in Ensemble is
purchasable: real variants, a real total, carts filled across every store involved.

## Install (developer mode)

1. `chrome://extensions` -> Developer mode -> Load unpacked -> this folder.
2. Open the extension options and paste a Gemini API key (free at
   aistudio.google.com/apikey). It is stored locally and used only for style
   suggestions and try-on renders.
3. Visit any Shopify store. The badge shows ON; click the toolbar icon to open the
   side panel.
4. Set your photo, load the catalog, build the look, render it, add all to carts.
5. Every Shopify store you visit appears as a store chip in the panel; switch chips to
   browse each store's catalog, and style suggestions draw from every catalog you have
   loaded this session, so a look can mix stores.

Your photo never leaves your machine except inside the render request to Google's
Gemini API. Nothing is stored server-side; there is no server.

## Tests

    node --test tests/shopify.test.mjs

The fixture is a real Shopify catalog page (Princess Polly, `/products.json`).
