"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import type { ChatMsg } from "@chess/shared/protocol";

export function ChatPanel({
  messages,
  canSend,
  onSend,
}: {
  messages: ChatMsg[];
  canSend: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [messages.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider px-3 py-2 border-b border-[var(--border)] text-[var(--fg-muted)] font-mono">
        Chat
      </div>
      <div ref={ref} className="overflow-y-auto flex-1 p-3 space-y-1.5">
        {messages.length === 0 ? (
          <p className="text-xs text-[var(--fg-subtle)]">
            {canSend ? "Be cordial, GLHF!" : "Spectators cannot send chat."}
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="text-sm leading-snug">
              <span className="font-mono text-[var(--accent)] mr-1.5">{m.from}:</span>
              <span className="text-[var(--fg)]">{m.text}</span>
            </div>
          ))
        )}
      </div>
      {canSend && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (!t) return;
            onSend(t);
            setText("");
          }}
          className="border-t border-[var(--border)] p-2"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 200))}
            placeholder="Say something… (200 chars max)"
            className="h-9 text-sm"
          />
        </form>
      )}
    </div>
  );
}
