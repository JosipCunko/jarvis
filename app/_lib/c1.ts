const FENCE_RE = /```(?:openui-lang|openui)?\s*\n?([\s\S]*?)```/g;

export function looksLikeGenUi(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return false;
  return (
    /^true\b/.test(trimmed) ||
    trimmed.includes("<content") ||
    trimmed.includes("openui-lang") ||
    trimmed.includes("thesys=") ||
    /\broot\s*=/.test(trimmed)
  );
}

export function extractOpenUi(content: string) {
  const trimmed = content.trim();
  const fenced = [...trimmed.matchAll(FENCE_RE)]
    .map((match) => match[1]?.trim() ?? "")
    .find((block) => block.includes("=") || block.includes("root"));
  if (fenced) return fenced;

  let code = trimmed.replace(/^true\s*\n\s*>?\s*\n?/, "").trim();
  code = code.replace(/^```(?:openui-lang|openui)?\s*\n?/, "");
  code = code.replace(/```\s*$/, "");
  return code.trim();
}

export function toC1Response(content: string) {
  const trimmed = content.trim();
  if (/<(content|custommarkdown)[\s>]/i.test(trimmed)) return trimmed;

  const code = extractOpenUi(trimmed);
  if (code && (/\broot\s*=/.test(code) || /[A-Za-z_]\w*\s*=/.test(code))) {
    return `<content thesys="true" version="2">${escapeXml(code)}</content>`;
  }

  return `<custommarkdown>${escapeXml(content)}</custommarkdown>`;
}

export function readableFromGenUi(content: string) {
  const lines = extractOpenUi(content)
    .split("\n")
    .map((line) => line.trim().replace(/^["']|["']$/g, ""))
    .filter((line) => {
      if (!line || line === "number" || line === "true" || line === ">") return false;
      if (line.startsWith("```")) return false;
      if (/^[A-Za-z_]\w*\s*=/.test(line)) return false;
      if (/^[A-Z][A-Za-z]+\($/.test(line)) return false;
      if (/^[\]\),]+$/.test(line)) return false;
      return line.length > 2;
    });
  if (lines.length === 0) return "Standing by, sir.";
  return [...new Set(lines)].join("\n");
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
