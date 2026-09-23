import "server-only";

const MODEL = "google/gemini-2.5-flash-lite";
const COMPLETIONS = "https://openrouter.ai/api/v1/chat/completions";

const RESEARCH_INTENT =
  /\b(research\s+the\s+web|look(?:\s+(?:it|this|that))?\s+up|go\s+on\s+google|google\s+(?:it|this|that)|double[-\s]?check|fact[-\s]?check|verify(?:\s+(?:this|that|it|your))?|istraži|istrazi|provjeri\s+na\s+netu|idi\s+na\s+google|jesi\s+siguran)\b/i;

export type WebSource = {
  title: string;
  url: string;
  snippet: string;
};

export type WebResearchResult = {
  query: string;
  sources: WebSource[];
  error?: string;
};

type UrlCitation = {
  url?: string;
  title?: string;
  content?: string;
};

type Annotation = UrlCitation & {
  type?: string;
  url_citation?: UrlCitation;
};

type ResearchMessage = {
  content?: unknown;
  annotations?: Annotation[];
  citations?: unknown;
};

export function isWebResearchRequest(text: string) {
  return RESEARCH_INTENT.test(text);
}

export async function researchWeb(query: string): Promise<WebResearchResult> {
  const trimmed = query.trim().slice(0, 300);
  if (!trimmed) {
    return { query: "", sources: [], error: "I need something to look up." };
  }
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    return {
      query: trimmed,
      sources: [],
      error: "I could not reach the web. OpenRouter is not configured.",
    };
  }

  try {
    const response = await fetch(COMPLETIONS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tool_calls: 2,
        messages: [
          {
            role: "system",
            content:
              'Call the web search tool once for the query. Then reply with JSON only: {"sources":[{"title":"","url":"","snippet":""}]}. Use only URLs from the search. Keep each snippet under 240 characters. No markdown.',
          },
          { role: "user", content: trimmed },
        ],
        tools: [
          {
            type: "openrouter:web_search",
            parameters: {
              max_results: 5,
              max_total_results: 5,
              max_uses: 1,
              max_characters: 500,
            },
          },
        ],
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 180);
      return {
        query: trimmed,
        sources: [],
        error: `I could not reach the web. ${detail || "Search failed."}`,
      };
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown; annotations?: Annotation[] } }>;
      usage?: { server_tool_use?: { web_search_requests?: number } };
    };
    const message = payload.choices?.[0]?.message ?? {};
    const searched = (payload.usage?.server_tool_use?.web_search_requests ?? 0) > 0;
    const grounded = searched || (message.annotations ?? []).length > 0;
    const sources = collectSources(message, grounded);
    if (sources.length === 0) {
      return {
        query: trimmed,
        sources: [],
        error: "The web search returned no sources.",
      };
    }
    return { query: trimmed, sources: sources.slice(0, 5) };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      query: trimmed,
      sources: [],
      error: timedOut ? "The web search timed out." : "I could not reach the web.",
    };
  }
}

function collectSources(message: ResearchMessage, grounded: boolean) {
  const fromAnnotations = (message.annotations ?? []).flatMap((item) => {
    const source = toSource(item.url_citation ?? item);
    return source ? [source] : [];
  });
  const fromCitations = citationSources(message.citations);
  const fromJson = grounded ? parseJsonSources(messageText(message.content)) : [];
  const merged = new Map<string, WebSource>();
  for (const source of [...fromAnnotations, ...fromCitations, ...fromJson]) {
    const key = source.url.replace(/\/$/, "");
    const current = merged.get(key);
    if (!current || source.snippet.length > current.snippet.length) {
      merged.set(key, {
        ...source,
        title: source.title || current?.title || hostname(source.url),
      });
    }
  }
  return [...merged.values()];
}

function citationSources(citations: unknown): WebSource[] {
  if (!Array.isArray(citations)) return [];
  return citations.flatMap((item) => {
    if (typeof item === "string") {
      const source = toSource({ url: item });
      return source ? [source] : [];
    }
    if (item && typeof item === "object") {
      const source = toSource(item as UrlCitation);
      return source ? [source] : [];
    }
    return [];
  });
}

function toSource(citation: UrlCitation | undefined): WebSource | null {
  const url = citation?.url?.trim() ?? "";
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    title: (citation?.title?.trim() || hostname(url)).slice(0, 120),
    url,
    snippet: (citation?.content ?? "").replace(/\s+/g, " ").trim().slice(0, 280),
  };
}

function parseJsonSources(text: string): WebSource[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      sources?: Array<{ title?: unknown; url?: unknown; snippet?: unknown }>;
    };
    return (parsed.sources ?? []).flatMap((item) => {
      const source = toSource({
        url: typeof item.url === "string" ? item.url : "",
        title: typeof item.title === "string" ? item.title : "",
        content: typeof item.snippet === "string" ? item.snippet : "",
      });
      return source ? [source] : [];
    });
  } catch {
    return [];
  }
}

function messageText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        return String((part as { text?: unknown }).text ?? "");
      }
      return "";
    })
    .join("\n");
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
