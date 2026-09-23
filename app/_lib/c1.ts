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

function readQuoted(source: string, index: number) {
  const quote = source[index];
  if (quote !== '"' && quote !== "'") return null;
  let i = index + 1;
  let closed = false;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === quote) {
      i += 1;
      closed = true;
      break;
    }
    i += 1;
  }
  if (!closed) return null;
  const raw = source.slice(index, i);
  try {
    const value = quote === '"' ? JSON.parse(raw) : unescapeSingle(raw.slice(1, -1));
    return { value: String(value), end: i };
  } catch {
    return { value: raw.slice(1, -1), end: i };
  }
}

function unescapeSingle(value: string) {
  return value.replace(/\\([\\'nt])/g, (_, esc: string) => {
    if (esc === "n") return "\n";
    if (esc === "t") return "\t";
    return esc;
  });
}

function isCodeSnippet(value: string) {
  const text = value.trim();
  if (text.length < 24 || !/[{;}]/.test(text)) return false;
  return /\bfetch\s*\(|\bfunction\b|=>|\b(?:const|let|class|import|await|return)\b/.test(text);
}

function looksLikeMinifiedCode(value: string) {
  const text = value.trim();
  if (text.length < 40 || text.includes("\n")) return false;
  if (!text.includes("{") || !text.includes("}")) return false;
  return isCodeSnippet(text);
}

function formatCode(source: string) {
  const src = source.replace(/[ \t]*\n[ \t]*/g, " ").replace(/[ \t]+/g, " ").trim();
  let out = "";
  let indent = 0;
  let paren = 0;
  let bracket = 0;
  let quote: string | null = null;
  const pad = () => "  ".repeat(indent);
  const skipSpace = (index: number) => {
    let next = index;
    while (src[next] === " ") next += 1;
    return next;
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        const next = src[i + 1];
        if (next) {
          out += next;
          i += 1;
        }
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "(") {
      paren += 1;
      out += ch;
      continue;
    }
    if (ch === ")") {
      paren = Math.max(0, paren - 1);
      out += ch;
      continue;
    }
    if (ch === "[") {
      bracket += 1;
      out += ch;
      continue;
    }
    if (ch === "]") {
      bracket = Math.max(0, bracket - 1);
      out += ch;
      continue;
    }
    if (ch === "{") {
      const closer = skipSpace(i + 1);
      if (src[closer] === "}") {
        out = out.replace(/[ \t]+$/, "");
        if (out && !/[\s{]$/.test(out)) out += " ";
        out += "{}";
        i = closer;
        continue;
      }
      out = out.replace(/[ \t]+$/, "");
      if (out && !out.endsWith("\n")) out += " ";
      out += "{\n";
      indent += 1;
      out += pad();
      i = skipSpace(i + 1) - 1;
      continue;
    }
    if (ch === "}") {
      indent = Math.max(0, indent - 1);
      out = out.replace(/[ \t]+$/, "");
      if (!out.endsWith("\n")) out += "\n";
      out += `${pad()}}`;
      const next = skipSpace(i + 1);
      if (/^(?:else|catch|finally|while)\b/.test(src.slice(next))) {
        out += " ";
        i = next - 1;
      } else if (src[next] && src[next] !== ";" && src[next] !== "," && src[next] !== ")" && src[next] !== "}") {
        out += `\n${pad()}`;
        i = next - 1;
      }
      continue;
    }
    if (ch === ";" && paren === 0 && bracket === 0) {
      out += `;\n${pad()}`;
      i = skipSpace(i + 1) - 1;
      continue;
    }
    out += ch;
  }

  const formatted = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return formatted;
}

function prettifyFencedCode(value: string) {
  if (!value.includes("```")) return value;
  return value.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (full, lang: string, code: string) => {
    const body = code.replace(/\s+$/, "").replace(/^\n/, "");
    if (!looksLikeMinifiedCode(body)) return full;
    return `\`\`\`${lang}\n${formatCode(body)}\n\`\`\``;
  });
}

function formattedCode(value: string) {
  return value.includes("\n") ? value.trim() : formatCode(value);
}

function insertCodeRefs(source: string, refs: string) {
  const match = /Card\s*\(\s*\[/.exec(source);
  if (!match) return source;
  let i = match.index + match[0].length;
  let depth = 1;
  let quote = "";
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) quote = "";
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") {
      depth -= 1;
      if (ch === "]" && depth === 0) {
        const before = source.slice(0, i).trimEnd();
        const comma = before.endsWith("[") ? "" : ", ";
        return `${before}${comma}${refs}${source.slice(i)}`;
      }
    } else if (ch === "," && depth === 1) {
      return `${source.slice(0, i + 1)} ${refs},${source.slice(i + 1)}`;
    }
    i += 1;
  }
  return source;
}

export function prettifyOpenUiCode(source: string) {
  const blocks: string[] = [];
  const stack: string[] = [];
  let out = "";
  for (let i = 0; i < source.length; i += 1) {
    const ident = source.slice(i).match(/^[A-Za-z_]\w*/);
    if (ident) {
      let j = i + ident[0].length;
      while (source[j] === " " || source[j] === "\n" || source[j] === "\t") j += 1;
      if (source[j] === "(") {
        stack.push(ident[0]);
        out += source.slice(i, j + 1);
        i = j;
        continue;
      }
    }
    const ch = source[i];
    if (ch === "(") {
      stack.push("");
      out += ch;
      continue;
    }
    if (ch === ")") {
      stack.pop();
      out += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quoted = readQuoted(source, i);
      if (!quoted) {
        out += source.slice(i);
        break;
      }
      const insideCodeBlock = stack.includes("CodeBlock");
      const snippet = isCodeSnippet(quoted.value) || looksLikeMinifiedCode(quoted.value);
      if (insideCodeBlock && looksLikeMinifiedCode(quoted.value)) {
        out += JSON.stringify(formattedCode(quoted.value));
      } else if (!insideCodeBlock && snippet && !quoted.value.includes("```")) {
        const id = `jarvisCode${blocks.length}`;
        blocks.push(`${id} = CodeBlock("javascript", ${JSON.stringify(formattedCode(quoted.value))})`);
        out += '""';
      } else {
        const next = quoted.value.includes("```") ? prettifyFencedCode(quoted.value) : quoted.value;
        out += next === quoted.value ? source.slice(i, quoted.end) : JSON.stringify(next);
      }
      i = quoted.end - 1;
      continue;
    }
    out += ch;
  }
  if (blocks.length === 0) return out;
  const refs = blocks.map((_, index) => `jarvisCode${index}`).join(", ");
  return `${insertCodeRefs(out, refs)}\n${blocks.join("\n")}`;
}

function prettifyWrapped(content: string) {
  return content.replace(
    /(<(content|custommarkdown)\b[^>]*>)([\s\S]*)(<\/\2>)/i,
    (_full, open: string, tag: string, inner: string, close: string) => {
      const decoded = decodeEntities(inner);
      const pretty = tag.toLowerCase() === "content" ? prettifyOpenUiCode(decoded) : prettifyFencedCode(decoded);
      return `${open}${escapeXml(pretty)}${close}`;
    },
  );
}

export function toC1Response(content: string) {
  const trimmed = content.trim();
  if (/<(content|custommarkdown)[\s>]/i.test(trimmed)) return prettifyWrapped(trimmed);

  const code = extractOpenUi(trimmed);
  if (code && (/\broot\s*=/.test(code) || /[A-Za-z_]\w*\s*=/.test(code))) {
    return `<content thesys="true" version="2">${escapeXml(prettifyOpenUiCode(code))}</content>`;
  }

  return `<custommarkdown>${escapeXml(prettifyFencedCode(content))}</custommarkdown>`;
}

const SPEECH_LIMIT = 4000;
const STYLE_TOKEN =
  /^(small|default|large|small-heavy|large-heavy|primary|secondary|info|warning|error|success|neutral|danger|clear|card|sunk|sm|md|lg|single)$/i;

function cleanSpeech(value: string) {
  return value
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi, " ")
    .replace(/^[•●▪◦]\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function ensurePause(value: string) {
  const text = cleanSpeech(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function normalizeSpeech(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pushSpoken(parts: string[], raw: string) {
  const text = ensurePause(raw);
  const norm = normalizeSpeech(text);
  if (!norm) return;
  for (let i = 0; i < parts.length; i += 1) {
    const other = normalizeSpeech(parts[i]);
    if (other === norm || other.startsWith(norm)) return;
    if (norm.startsWith(other)) {
      parts.splice(i, 1);
      i -= 1;
    }
  }
  parts.push(text);
}

function capSpeech(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= SPEECH_LIMIT) return clean;
  const cut = clean.slice(0, SPEECH_LIMIT);
  const boundary = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (boundary > 200) return cut.slice(0, boundary + 1).trim();
  return cut.trim();
}

function leadingProse(content: string) {
  const stripped = content
    .replace(/```(?:openui-lang|openui)?[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped || looksLikeGenUi(stripped)) return "";
  return stripped;
}

function decodeEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function isSpokenPhrase(value: string) {
  const text = cleanSpeech(value);
  if (!text || text.length < 3 || STYLE_TOKEN.test(text)) return false;
  if (/^[a-z0-9_-]+$/i.test(text)) return false;
  return true;
}

function readString(code: string, index: number) {
  const quote = code[index];
  if (quote !== '"' && quote !== "'") return null;
  let value = "";
  let i = index + 1;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "\\") {
      const next = code[i + 1];
      if (next === "n") value += " ";
      else if (next) value += next;
      i += 2;
      continue;
    }
    if (ch === quote) return { value, end: i + 1 };
    value += ch;
    i += 1;
  }
  return { value, end: code.length };
}

const HEADING_COMPONENTS = new Set(["CardHeader", "Header", "SectionItem", "SectionBlock"]);
const HEADING_SIZE = /^(large|large-heavy|small-heavy)$/i;

function isSentence(value: string) {
  return /[.!?…]/.test(value) || value.trim().length > 80;
}

function stringsToSpeak(name: string, args: string[]) {
  if (HEADING_COMPONENTS.has(name) || name === "CodeBlock") return [];
  if (name === "TextContent" || name === "Text") {
    const text = args.find((arg) => isSpokenPhrase(arg));
    if (!text) return [];
    const heading = args.some((arg) => HEADING_SIZE.test(arg.trim()));
    const shortLabel = !isSentence(text) && text.trim().split(/\s+/).length <= 4;
    if (heading || shortLabel) return [];
    return [text];
  }
  if (name === "ListItem") return args.filter((arg) => isSpokenPhrase(arg));
  return args.filter((arg) => isSpokenPhrase(arg) && isSentence(arg));
}

function spokenPieces(code: string) {
  const spoken: string[] = [];
  const stack: { name: string; args: string[] }[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (/\s/.test(ch) || ch === "," || ch === "[" || ch === "]" || ch === "{" || ch === "}") {
      i += 1;
      continue;
    }
    if (ch === ")") {
      const frame = stack.pop();
      if (frame) spoken.push(...stringsToSpeak(frame.name, frame.args));
      i += 1;
      continue;
    }
    const ident = code.slice(i).match(/^[A-Za-z_]\w*/);
    if (ident) {
      let j = i + ident[0].length;
      while (code[j] === " " || code[j] === "\n" || code[j] === "\t" || code[j] === "\r") j += 1;
      if (code[j] === "(") {
        stack.push({ name: ident[0], args: [] });
        i = j + 1;
        continue;
      }
      i = j;
      continue;
    }
    const quoted = readString(code, i);
    if (quoted) {
      stack[stack.length - 1]?.args.push(quoted.value);
      i = quoted.end;
      continue;
    }
    i += 1;
  }
  return spoken;
}

export function speakableReply(content: string) {
  const decoded = decodeEntities(content);
  const parts: string[] = [];
  const lead = leadingProse(decoded);
  if (lead) pushSpoken(parts, lead);
  for (const piece of spokenPieces(extractOpenUi(decoded))) pushSpoken(parts, piece);
  return capSpeech(parts.join(" "));
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
