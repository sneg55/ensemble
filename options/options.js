const key = document.getElementById("key");
const saved = document.getElementById("saved");
chrome.storage.local.get("apiKey").then(({ apiKey }) => {
  if (apiKey) key.value = apiKey;
});
document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ apiKey: key.value.trim() });
  saved.textContent = "Saved";
});
