import { getApiKey, setApiKey } from "../lib/config.js";

const key = document.getElementById("key");
const saved = document.getElementById("saved");
getApiKey().then((apiKey) => {
  if (apiKey) key.value = apiKey;
});
document.getElementById("save").addEventListener("click", async () => {
  await setApiKey(key.value);
  saved.textContent = "Saved";
});
