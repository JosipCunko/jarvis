"use client";

import { useMemo, useState } from "react";
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
  chatAssistantResponseBg: "#0a1c30",
  chatAssistantResponseText: "#e8f7ff",
  chatUserResponseBg: "#00d4ff",
  chatUserResponseText: "#021018",
  dangerPrimaryText: "#ff5d73",
  alertPrimaryText: "#f5c542",
};

type C1ActionEvent = {
  humanFriendlyMessage?: string;
  llmFriendlyMessage?: string;
  params?: {
    humanFriendlyMessage?: string;
    llmFriendlyMessage?: string;
  };
};

export default function C1Message({
  content,
  isStreaming = false,
  onAction,
}: {
  content: string;
  isStreaming?: boolean;
  onAction?: (text: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const c1Response = useMemo(() => toC1Response(content), [content]);

  if (failed) {
    return (
      <p className="whitespace-pre-wrap text-sm text-ink">
        {readableFromGenUi(content)}
      </p>
    );
  }

  return (
    <div className="jarvis-c1 w-full min-w-0 overflow-x-auto">
      <ThemeProvider mode="dark" cssSelector=".jarvis-c1" theme={JARVIS_THEME}>
        <C1Component
          c1Response={c1Response}
          isStreaming={isStreaming}
          onError={() => setFailed(true)}
          onAction={(event: C1ActionEvent) => {
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
