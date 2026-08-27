export function newLook(name) {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    items: [],
    renders: []
  };
}

export function addItem(look, product, variant) {
  if (look.items.some((i) => i.variantId === variant.id && i.storeOrigin === product.storeOrigin))
    return look;
  return {
    ...look,
    items: [
      ...look.items,
      {
        storeOrigin: product.storeOrigin,
        handle: product.handle,
        title: product.title,
        image: product.image,
        variantId: variant.id,
        variantTitle: variant.title,
        price: variant.price
      }
    ]
  };
}

export function removeItem(look, variantId) {
  return { ...look, items: look.items.filter((i) => i.variantId !== variantId) };
}
