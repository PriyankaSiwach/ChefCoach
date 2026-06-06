

import { replyOfflineDietCoach } from "@/lib/chat-coach-offline";
import { useCallback, useEffect, useRef, useState } from "react";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

const CHAT_SEEN_KEY = "recipify_chat_seen";

function callDietCoach(_history: ChatMessage[], userText: string): Promise<string> {
  return Promise.resolve(replyOfflineDietCoach(userText));
}

export function ChatBot({ hidden = false }: { hidden?: boolean }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showQuickChips, setShowQuickChips] = useState(true);
  const [showFabTooltip, setShowFabTooltip] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(CHAT_SEEN_KEY) === "1") return;
    } catch {
      return;
    }
    setShowFabTooltip(true);
    const t = window.setTimeout(() => setShowFabTooltip(false), 4000);
    return () => window.clearTimeout(t);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setShowQuickChips(false);
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const historyBefore = [...messages];
      const reply = await callDietCoach(historyBefore, trimmed);
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: reply },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: `Sorry — ${msg}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    "💪 Am I hitting protein today?",
    "🍽️ What should I eat for dinner?",
    "🔥 Give me a 500 kcal snack idea",
  ];

  return (
    <>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-[47] bg-black/25 md:bg-transparent"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[48] flex h-[90vh] w-full max-w-[100vw] flex-col overflow-hidden rounded-t-[20px] bg-white shadow-2xl md:bottom-24 md:left-auto md:right-6 md:h-[520px] md:w-[380px] md:max-h-[520px] md:rounded-t-[20px]"
          >
            <div className="flex shrink-0 items-start justify-between gap-2 rounded-t-[20px] bg-[#2D5016] px-4 py-3 text-[var(--cream)]">
              <div>
                <p className="font-semibold">🥗 Diet Assistant</p>
                <p className="text-xs text-white/85">Tips from your meal library</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                className="rounded-full px-2 py-1 text-lg leading-none text-white hover:bg-white/15"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
            >
              {messages.length === 0 && !loading ? (
                <p className="text-center text-sm text-[var(--gray)]">
                  Ask anything about your meals and goals.
                </p>
              ) : null}

              {showQuickChips && messages.length === 0 ? (
                <div className="flex flex-wrap gap-2">
                  {quickPrompts.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="rounded-full border border-[var(--border)] bg-[var(--cream)] px-3 py-2 text-left text-xs text-[var(--text)]"
                      onClick={() => void sendMessage(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : null}

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-[#2D5016] text-white"
                        : "border border-[var(--border)] bg-white text-[var(--text)]"
                    }`}
                    style={{
                      animation:
                        m.role === "user"
                          ? "chatBubbleInRight 250ms ease-out both"
                          : "chatBubbleInLeft 250ms ease-out both",
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {loading ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-[var(--gray)]"
                      style={{ animation: "dotBounce 900ms ease-in-out infinite 0ms" }}
                    />
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-[var(--gray)]"
                      style={{ animation: "dotBounce 900ms ease-in-out infinite 150ms" }}
                    />
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-[var(--gray)]"
                      style={{ animation: "dotBounce 900ms ease-in-out infinite 300ms" }}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 gap-2 border-t border-[var(--border)] bg-white p-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendMessage(input);
                }}
                placeholder="Ask your coach..."
                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[#2D5016]"
              />
              <button
                type="button"
                aria-label="Send"
                disabled={loading}
                onClick={() => void sendMessage(input)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2D5016] text-lg font-semibold text-white disabled:opacity-50"
              >
                <span aria-hidden>➤</span>
              </button>
            </div>
          </div>
        </>
      ) : null}

      {!hidden ? (
      <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom,0px))] right-[max(1.5rem,env(safe-area-inset-right))] z-[55] md:bottom-6">
        {showFabTooltip && !open ? (
          <div
            className="absolute bottom-full right-0 mb-3 max-w-[220px] rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-center text-xs font-medium text-[var(--text)] shadow-lg"
            role="status"
          >
            Ask me anything about your diet 👋
            <span className="absolute -bottom-1 right-5 h-2 w-2 rotate-45 border-b border-r border-[var(--border)] bg-white" />
          </div>
        ) : null}
        <button
          type="button"
          aria-label={open ? "Close diet assistant" : "Open diet assistant"}
          onClick={() => {
            try {
              window.localStorage.setItem(CHAT_SEEN_KEY, "1");
            } catch {
              /* ignore */
            }
            setShowFabTooltip(false);
            setOpen((v) => !v);
          }}
          className="relative flex h-14 w-14 items-center justify-center outline-none"
        >
          <span
            className="chat-fab-pulse-ring pointer-events-none absolute inset-[-4px] rounded-full border-2 border-[#2D5016]/45"
            aria-hidden
          />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#2D5016] to-[#4a7c28] text-xl text-white shadow-[0_8px_24px_rgba(45,80,22,0.45)] transition hover:brightness-110 active:scale-95">
            {open ? <span className="text-lg font-light">✕</span> : <span aria-hidden>✨</span>}
          </span>
        </button>
      </div>
      ) : null}
    </>
  );
}
