// Assembles the final demo from scenes.json in a single ffmpeg pass:
//   - card/term scenes: the rendered PNG held for the scene length
//   - ui scenes: the testreel capture, extended (last frame held) to scene length
//   - per scene: narration time-stretched by a global factor so the whole video
//     lands under TARGET seconds, padded with silence to the scene length
// Output: out/demo.mp4 (1920x1080, H.264 + AAC).

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, "scenes.json"), "utf8"));
const CARDS = path.join(__dirname, "out", "cards");
const AUDIO = path.join(__dirname, "out", "audio");
const CAPS = path.join(__dirname, "testreel-output");
const OUT = path.join(__dirname, "out", "demo.mp4");

// Knobs: TARGET is the runtime cap in seconds (e.g. 176 keeps a sub-3:00 video
// with headroom); TAIL is the per-scene breathing room after narration ends;
// BG is the pad color behind UI captures (match the card background).
const W = 1920,
  H = 1080,
  FPS = 30,
  TAIL = 0.4,
  TARGET = 150,
  BG = "0xfaf6f1";

const probe = (f) =>
  parseFloat(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", f],
      { encoding: "utf8" }
    ).trim()
  );

const latestCapture = (name) => {
  const files = fs.readdirSync(CAPS).filter((f) => f.startsWith(`${name}-`) && f.endsWith(".mp4"));
  if (!files.length) throw new Error(`no capture for "${name}" in testreel-output/`);
  files.sort();
  return path.join(CAPS, files[files.length - 1]);
};

// Measure narration + compute the global speed factor.
let sumDa = 0;
for (const s of scenes) {
  s._audio = path.join(AUDIO, `${s.id}.mp3`);
  if (!fs.existsSync(s._audio)) throw new Error(`missing narration for ${s.id}; run tts.mjs first`);
  s._da = probe(s._audio);
  sumDa += s._da;
}
const factor = Math.max(1, sumDa / (TARGET - scenes.length * TAIL));
for (const s of scenes) s._len = s._da / factor + TAIL;
const total = scenes.reduce((a, s) => a + s._len, 0);
console.log(
  `narration ${sumDa.toFixed(1)}s -> speed x${factor.toFixed(3)} -> final ~${total.toFixed(1)}s`
);

// Build one ffmpeg invocation with paired (video, audio) inputs per scene.
const inputs = [];
const filters = [];
const concatLabels = [];
let idx = 0;
scenes.forEach((s, i) => {
  const L = s._len.toFixed(3);
  let vIdx;
  if (s.kind === "ui") {
    const cap = latestCapture(s.capture);
    const U = probe(cap);
    const squeeze = U > s._len ? s._len / U : 1;
    const hold = Math.max(0, s._len - U * squeeze).toFixed(3);
    inputs.push("-i", cap);
    vIdx = idx++;
    filters.push(
      `[${vIdx}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:-1:-1:color=${BG},setpts=PTS*${squeeze.toFixed(4)},fps=${FPS},setsar=1,tpad=stop_mode=clone:stop_duration=${hold},format=yuv420p,trim=0:${L},setpts=PTS-STARTPTS[v${i}]`
    );
  } else {
    inputs.push("-loop", "1", "-t", L, "-i", path.join(CARDS, `${s.id}.png`));
    vIdx = idx++;
    filters.push(
      `[${vIdx}:v]scale=${W}:${H},fps=${FPS},setsar=1,format=yuv420p,trim=0:${L},setpts=PTS-STARTPTS[v${i}]`
    );
  }
  inputs.push("-i", s._audio);
  const aIdx = idx++;
  filters.push(
    `[${aIdx}:a]atempo=${factor.toFixed(4)},aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${L},asetpts=N/SR/TB[a${i}]`
  );
  concatLabels.push(`[v${i}][a${i}]`);
});
filters.push(`${concatLabels.join("")}concat=n=${scenes.length}:v=1:a=1[v][a]`);

const args = [
  "-y",
  "-loglevel",
  "error",
  ...inputs,
  "-filter_complex",
  filters.join(";"),
  "-map",
  "[v]",
  "-map",
  "[a]",
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "18",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-movflags",
  "+faststart",
  OUT
];
console.log("encoding...");
execFileSync("ffmpeg", args, { stdio: "inherit" });
console.log(`done -> ${path.relative(process.cwd(), OUT)} (${probe(OUT).toFixed(1)}s)`);
