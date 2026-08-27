export function extractProducts(productsJson, storeOrigin) {
  return (productsJson.products || [])
    .map((p) => ({
      storeOrigin,
      handle: p.handle,
      title: p.title,
      productType: p.product_type || "",
      tags: Array.isArray(p.tags)
        ? p.tags
        : String(p.tags || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
      vendor: p.vendor || "",
      image: p.images && p.images[0] ? p.images[0].src : null,
      variants: (p.variants || []).map((v) => ({
        id: v.id,
        title: v.title,
        price: v.price,
        available: v.available !== false,
        options: [v.option1, v.option2, v.option3].filter(Boolean)
      }))
    }))
    .filter((p) => p.image && p.variants.length > 0);
}

export function firstAvailableVariant(product) {
  return product.variants.find((v) => v.available) || product.variants[0] || null;
}

export function lookTotalByStore(items) {
  const totals = {};
  for (const item of items) {
    const price = Number(item.price || 0);
    totals[item.storeOrigin] = (totals[item.storeOrigin] || 0) + price;
  }
  return totals;
}

export function groupItemsByStore(items) {
  const groups = {};
  for (const item of items) {
    if (!groups[item.storeOrigin]) groups[item.storeOrigin] = [];
    groups[item.storeOrigin].push(item);
  }
  return groups;
}

export function catalogSummaryForPrompt(products, limit = 120) {
  return products
    .slice(0, limit)
    .map((p) => {
      const v = firstAvailableVariant(p);
      return `${p.handle} | ${p.title} | ${p.productType} | ${v ? v.price : "?"}`;
    })
    .join("\n");
}

export function productFromNative(sc, storeOrigin, fallbackImage) {
  const p = sc.product || sc;
  return {
    storeOrigin,
    handle: p.handle,
    title: p.title,
    productType: p.product_type || "",
    tags: [],
    vendor: p.vendor || "",
    image: (Array.isArray(p.images) && p.images[0]) || p.image || fallbackImage || null,
    variants: (p.variants || []).map((v) => ({
      id: v.id,
      title: v.title,
      price:
        v.price && typeof v.price.amount === "number"
          ? (v.price.amount / 100).toFixed(2)
          : String(v.price || ""),
      available: v.availability ? Boolean(v.availability.available) : true,
      options: (v.options || []).map((o) => o.value).filter(Boolean)
    }))
  };
}
