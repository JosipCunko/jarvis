"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { C1Component, ThemeProvider } from "@thesysai/genui-sdk";
import "@crayonai/react-ui/styles/index.css";
import { readableFromGenUi, toC1Response } from "@/app/_lib/c1";

const JARVIS_THEME = {
  backgroundFills: "#020b16",
  containerFills: "#071525",
  sunkFills: "#0a1c30",
  primaryText: "#e8f7ff",
  secondaryText: "#7aa4b8",
  strokeDefault: "rgba(0, 212, 255, 0.28)",
  interactiveAccent: "#00d4ff",
  interactiveAccentHover: "#5ce1ff",
  chatAssistantResponseBg: "transparent",
  chatAssistantResponseText: "#e8f7ff",
  chatUserResponseBg: "transparent",
  chatUserResponseText: "#5ce1ff",
  dangerPrimaryText: "#ff5d73",
  alertPrimaryText: "#f5c542",
};

type C1ActionEvent = {
  type?: string;
  humanFriendlyMessage?: string;
  llmFriendlyMessage?: string;
  params?: {
    url?: string;
    humanFriendlyMessage?: string;
    llmFriendlyMessage?: string;
  };
};

function openSource(url: string | undefined) {
  if (!url || !/^https?:\/\//i.test(url)) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function C1Message({
  content,
  isStreaming = false,
  onAction,
  onLayout,
}: {
  content: string;
  isStreaming?: boolean;
  onAction?: (text: string) => void;
  onLayout?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const c1Response = useMemo(() => toC1Response(content), [content]);

  useLayoutEffect(() => {
    onLayout?.();
    const node = rootRef.current;
    if (!node || !onLayout) return;
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => onLayout());
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onLayout, content]);

  if (failed) {
    const unfinished = /<content\b/i.test(content) && !/<\/content>/i.test(content);
    if (unfinished) return null;
    return (
      <p className="whitespace-pre-wrap text-sm text-ink">
        {readableFromGenUi(content)}
      </p>
    );
  }

  return (
    <div ref={rootRef} className="jarvis-c1 w-full min-w-0 overflow-x-auto">
      <ThemeProvider mode="dark" cssSelector=".jarvis-c1" theme={JARVIS_THEME}>
        <C1Component
          c1Response={c1Response}
          isStreaming={isStreaming}
          onError={() => setFailed(true)}
          onAction={(event: C1ActionEvent) => {
            if (event.type === "open_url") {
              openSource(event.params?.url);
              return;
            }
            const text =
              event.params?.humanFriendlyMessage ||
              event.humanFriendlyMessage ||
              event.params?.llmFriendlyMessage ||
              event.llmFriendlyMessage;
            if (text) onAction?.(text);
          }}
        />
      </ThemeProvider>
    </div>
  );
}
