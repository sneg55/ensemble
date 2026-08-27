const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const TEXT_MODEL = "gemini-2.5-flash";

async function call(model, parts, generationConfig, apiKey) {
  const res = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts }],
      ...(generationConfig ? { generationConfig } : {})
    })
  });
  if (!res.ok)
    throw new Error(`gemini ${model} http ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function inlinePart(dataUrl) {
  const [meta, data] = dataUrl.split(",");
  const mimeType = meta.slice(5, meta.indexOf(";"));
  return { inlineData: { mimeType, data } };
}

export async function renderLook(photoDataUrl, itemImageDataUrls, itemTitles, apiKey) {
  const instruction = [
    "The first image is a full-body photo of a person. Every following image is an e-commerce",
    "catalog photo of one clothing item, possibly shown on a different model or on its own.",
    `The items, in order, are: ${itemTitles.join("; ")}.`,
    "Produce a single photograph of ONLY the person from the first image, in the same pose,",
    "same background and same lighting, now wearing all of the listed items together as one",
    "coherent outfit. Reproduce each item's fabric, color, cut and length faithfully, draped",
    "naturally. Preserve the person's face, hair, skin tone and body proportions exactly.",
    "Output one image of one person only."
  ].join(" ");
  const parts = [
    inlinePart(photoDataUrl),
    ...itemImageDataUrls.map(inlinePart),
    { text: instruction }
  ];
  const out = await call(IMAGE_MODEL, parts, { responseModalities: ["TEXT", "IMAGE"] }, apiKey);
  const imagePart = (out.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!imagePart) throw new Error("render returned no image");
  return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
}

export async function verifyKey(apiKey) {
  const res = await fetch(`${API_BASE}?pageSize=1`, { headers: { "x-goog-api-key": apiKey } });
  return res.ok;
}

export async function suggestMatches(lookItemTitles, catalogSummary, apiKey) {
  const prompt = [
    "You are a fashion stylist. The customer's look so far contains:",
    lookItemTitles.length ? lookItemTitles.join("; ") : "(nothing yet)",
    "Below is a store catalog, one item per line as: handle | title | type | price.",
    "Pick up to 4 items from the catalog that complete or complement the look.",
    "Answer with ONLY the handles, one per line, no other text.",
    "",
    catalogSummary
  ].join("\n");
  const out = await call(TEXT_MODEL, [{ text: prompt }], null, apiKey);
  const text = out.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.includes(" "))
    .slice(0, 4);
}
