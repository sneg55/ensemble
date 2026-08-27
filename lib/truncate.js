export function truncateForPrompt(text, { maxChars = 16000, maxLines = 200, headLines = 140 } = {}) {
  let lines = text.split("\n");
  if (lines.length > maxLines) {
    const tail = lines.slice(lines.length - (maxLines - headLines));
    const dropped = lines.length - maxLines;
    lines = [...lines.slice(0, headLines), `[... ${dropped} lines omitted ...]`, ...tail];
  }
  let out = lines.join("\n");
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars - 60)}\n[... truncated at ${maxChars} chars ...]`;
  }
  return out;
}
