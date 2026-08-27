import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, "scenes.json"), "utf8"));
const OUT = path.join(__dirname, "out", "audio");
fs.mkdirSync(OUT, { recursive: true });

const KEY = process.env.GEMINI_KEY;
if (!KEY) {
  console.error("GEMINI_KEY is not set");
  process.exit(1);
}
const MODEL = "gemini-2.5-flash-preview-tts";
const VOICE = process.env.TTS_VOICE || "Kore";
const STYLE = "Narrate in a clear, confident, even product-demo voice, no hard sell: ";

const hash = (t) =>
  crypto.createHash("sha256").update(`${MODEL}|${VOICE}|${t}`).digest("hex").slice(0, 16);

async function synth(scene) {
  const mp3 = path.join(OUT, `${scene.id}.mp3`);
  const stamp = path.join(OUT, `${scene.id}.hash`);
  const want = hash(scene.narrate);
  if (fs.existsSync(mp3) && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === want) {
    console.log(`  ${scene.id}: cached`);
    return;
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: STYLE + scene.narrate }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } }
        }
      })
    }
  );
  if (!res.ok)
    throw new Error(`${scene.id}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`${scene.id}: no audio in response`);
  const mime = part.inlineData.mimeType || "";
  const rate = /rate=(\d+)/.exec(mime)?.[1] || "24000";
  const pcm = path.join(OUT, `${scene.id}.pcm`);
  fs.writeFileSync(pcm, Buffer.from(part.inlineData.data, "base64"));
  execFileSync(
    "ffmpeg",
    ["-y", "-f", "s16le", "-ar", rate, "-ac", "1", "-i", pcm, "-b:a", "160k", mp3],
    { stdio: "ignore" }
  );
  fs.rmSync(pcm);
  fs.writeFileSync(stamp, want);
  console.log(`  ${scene.id}: synthesized (${mime})`);
}

for (const s of scenes) await synth(s);
console.log("done");
