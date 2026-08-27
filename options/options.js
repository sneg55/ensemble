import { getApiKey, setApiKey } from "../lib/config.js";
import { verifyKey } from "../lib/gemini.js";

const key = document.getElementById("key");
const saved = document.getElementById("saved");
getApiKey().then((apiKey) => {
  if (apiKey) key.value = apiKey;
});
document.getElementById("save").addEventListener("click", async () => {
  const value = key.value.trim();
  if (!value) {
    saved.textContent = "Enter a key first";
    return;
  }
  saved.textContent = "Checking key...";
  await setApiKey(value);
  try {
    const ok = await verifyKey(value);
    saved.textContent = ok
      ? "Key verified and saved"
      : "Saved, but Google rejected this key: check it";
  } catch {
    saved.textContent = "Saved; could not verify (offline?)";
  }
});
