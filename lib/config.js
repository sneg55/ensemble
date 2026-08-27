export function getConfig(keys) {
  return chrome.storage.local.get(keys);
}

export async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  return typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null;
}

export async function setApiKey(apiKey) {
  await chrome.storage.local.set({ apiKey: String(apiKey).trim() });
}

export async function getPhoto() {
  const { photo } = await chrome.storage.local.get("photo");
  return typeof photo === "string" && photo.startsWith("data:image/") ? photo : null;
}

export async function setPhoto(photo) {
  await chrome.storage.local.set({ photo });
}

export async function getLook() {
  const { look } = await chrome.storage.local.get("look");
  return look && Array.isArray(look.items) ? look : null;
}

export async function setLook(look) {
  await chrome.storage.local.set({ look });
}

export async function getKnownStores() {
  const { knownStores } = await chrome.storage.local.get("knownStores");
  return knownStores || {};
}

export async function recordKnownStore(origin) {
  const stores = await getKnownStores();
  await chrome.storage.local.set({ knownStores: { ...stores, [origin]: Date.now() } });
}
