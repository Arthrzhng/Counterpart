"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { fetchProfile, upsertProfile } from "@/lib/profile-sync";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type DimensionScores = {
  abstract_vs_concrete: number | null;
  validation_vs_truth: number | null;
  divergent_vs_convergent: number | null;
  cautious_vs_decisive: number | null;
  conflict_avoidant_vs_direct: number | null;
  knowledge_confidence: number | null;
};

const DIMENSION_CONFIG = [
  {
    key: "abstract_vs_concrete" as const,
    leftPole: "Concrete",
    rightPole: "Abstract",
    range: [-1, 1] as [number, number],
  },
  {
    key: "validation_vs_truth" as const,
    leftPole: "Truth-seeking",
    rightPole: "Validation",
    range: [-1, 1] as [number, number],
  },
  {
    key: "divergent_vs_convergent" as const,
    leftPole: "Convergent",
    rightPole: "Divergent",
    range: [-1, 1] as [number, number],
  },
  {
    key: "cautious_vs_decisive" as const,
    leftPole: "Cautious",
    rightPole: "Decisive",
    range: [-1, 1] as [number, number],
  },
  {
    key: "conflict_avoidant_vs_direct" as const,
    leftPole: "Avoidant",
    rightPole: "Direct",
    range: [-1, 1] as [number, number],
  },
  {
    key: "knowledge_confidence" as const,
    leftPole: "Uncertain",
    rightPole: "Confident",
    range: [0, 1] as [number, number],
  },
] as const;

const STORAGE_KEY = "counterpart_session";
const SESSION_ID_KEY = "counterpart_session_id";

type DimensionKey = keyof DimensionScores;

type SessionData = {
  messages: ChatMessage[];
  dimensionScores: DimensionScores | null;
  deletedDimensions: DimensionKey[];
};

function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

function saveSession(data: SessionData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded — ignore
  }
}

function newMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function DimensionBar({
  score,
  range,
}: {
  score: number;
  range: [number, number];
}) {
  const [min, max] = range;
  const pct = Math.max(0, Math.min(100, ((score - min) / (max - min)) * 100));
  return (
    <div className="relative h-px w-full bg-white/15">
      <div
        className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#89aeb6]"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="markdown-message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ children, ...props }) => (
            <a
              {...props}
              className="text-[#9bc4cc] underline decoration-[#9bc4cc]/40 underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
          code: ({ children, className, ...props }) => (
            <code
              {...props}
              className={`${className ?? ""} rounded bg-white/10 px-1 py-0.5 font-mono text-[0.9em] text-white`}
            >
              {children}
            </code>
          ),
          pre: ({ children, ...props }) => (
            <pre
              {...props}
              className="overflow-x-auto rounded-md border border-white/10 bg-[#111111] p-3"
            >
              {children}
            </pre>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const RESTORE_DEFAULTS: DimensionScores = {
  abstract_vs_concrete: 0,
  validation_vs_truth: 0,
  divergent_vs_convergent: 0,
  cautious_vs_decisive: 0,
  conflict_avoidant_vs_direct: 0,
  knowledge_confidence: 0.5,
};

function getDimensionSubtitle(key: keyof DimensionScores, score: number): string {
  switch (key) {
    case "abstract_vs_concrete":
      return score > 0.3
        ? "Counterpart will ground your answers in specifics"
        : score < -0.3
          ? "Counterpart will elevate to principles and frameworks"
          : "Counterpart balances abstract and concrete";
    case "validation_vs_truth":
      return score > 0.3
        ? "Counterpart will surface blind spots gently"
        : score < -0.3
          ? "Counterpart will challenge your ideas directly"
          : "Counterpart balances challenge and support";
    case "divergent_vs_convergent":
      return score > 0.3
        ? "Counterpart will push you toward a decision"
        : score < -0.3
          ? "Counterpart will expand the possibility space"
          : "Counterpart balances options and decisions";
    case "cautious_vs_decisive":
      return score > 0.3
        ? "Counterpart will surface risks you may be discounting"
        : score < -0.3
          ? "Counterpart will give you committed recommendations"
          : "Counterpart balances caution and decisiveness";
    case "conflict_avoidant_vs_direct":
      return score > 0.3
        ? "Counterpart will skip softening and be blunt"
        : score < -0.3
          ? "Counterpart will frame challenges carefully"
          : "Counterpart balances directness and care";
    case "knowledge_confidence":
      return score > 0.7
        ? "Counterpart will introduce genuine uncertainty"
        : score < 0.3
          ? "Counterpart will validate what you know first"
          : "Counterpart balances confidence and doubt";
  }
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [dimensionScores, setDimensionScores] = useState<DimensionScores | null>(null);
  const [deletedDimensions, setDeletedDimensions] = useState<Set<DimensionKey>>(new Set());
  const [editingDimension, setEditingDimension] = useState<DimensionKey | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const supabaseSyncedRef = useRef(false);

  useEffect(() => {
    // Load or generate a stable session ID for cross-device identity
    let id = localStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SESSION_ID_KEY, id);
    }
    sessionIdRef.current = id;

    // Hydrate from localStorage immediately so the UI is ready without waiting on network
    const session = loadSession();
    if (session) {
      setMessages(session.messages);
      setDimensionScores(session.dimensionScores ?? null);
      setDeletedDimensions(new Set(session.deletedDimensions ?? []));
    }
    setHydrated(true);

    // Overlay with Supabase (source of truth across devices)
    fetchProfile(id)
      .then((remote) => {
        if (remote) setDimensionScores(remote);
      })
      .catch(() => undefined)
      .finally(() => {
        supabaseSyncedRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSession({ messages, dimensionScores, deletedDimensions: Array.from(deletedDimensions) });
  }, [messages, dimensionScores, deletedDimensions, hydrated]);

  // Write dimension scores to Supabase after every update, but only after the initial
  // fetch has completed so we don't overwrite remote data with a stale local cache.
  useEffect(() => {
    if (!hydrated || !supabaseSyncedRef.current || !sessionIdRef.current || dimensionScores === null)
      return;
    void upsertProfile(sessionIdRef.current, dimensionScores);
  }, [dimensionScores, hydrated]);

  function handleScoreChange(key: DimensionKey, value: number) {
    setDimensionScores((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleDelete(key: DimensionKey) {
    setDimensionScores((prev) => (prev ? { ...prev, [key]: null } : prev));
    setDeletedDimensions((prev) => new Set([...prev, key]));
    if (editingDimension === key) setEditingDimension(null);
  }

  function handleRestore(key: DimensionKey) {
    // Reset to null so the classifier rebuilds from the next messages, not from a wrong default
    setDimensionScores((prev) => (prev ? { ...prev, [key]: null } : prev));
    setDeletedDimensions((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const userMessage: ChatMessage = {
      id: newMessageId(),
      role: "user",
      content: trimmed,
    };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setError("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          dimensionScores,
          deletedDimensions: Array.from(deletedDimensions),
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        dimensionScores?: DimensionScores;
        error?: string;
      };

      if (!response.ok || !data.message) {
        throw new Error(data.error || "Counterpart could not respond.");
      }

      if (data.dimensionScores) {
        setDimensionScores(data.dimensionScores);
      }

      setMessages((current) => [
        ...current,
        {
          id: newMessageId(),
          role: "assistant",
          content: data.message || "I am here, but I do not have words for that yet.",
        },
      ]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Something went wrong.",
      );
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:px-6 md:py-6">
        <section className="flex min-h-[68vh] flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#141414]/80 shadow-2xl md:w-[70%]">
          <header className="border-b border-white/10 px-5 py-4">
            <h1 className="text-xl font-semibold tracking-normal">Counterpart</h1>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[36vh] items-center justify-center text-center text-sm text-white/45">
                Say what you are thinking through.
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[78%] rounded-lg px-4 py-3 text-sm leading-6 shadow-lg ${
                      message.role === "user"
                        ? "whitespace-pre-wrap bg-[#4f6f78] text-white"
                        : "border border-white/10 bg-[#1c1c1c] text-white/90"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <AssistantMessage content={message.content} />
                    ) : (
                      message.content
                    )}
                  </div>
                </article>
              ))
            )}

            {isSending ? (
              <div className="flex justify-start">
                <div className="rounded-lg border border-white/10 bg-[#1c1c1c] px-4 py-3 text-sm text-white/55">
                  Thinking...
                </div>
              </div>
            ) : null}
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-white/10 bg-[#111111] p-4"
          >
            {error ? (
              <div className="mb-3 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                rows={1}
                placeholder="Message Counterpart..."
                className="max-h-36 min-h-12 flex-1 resize-none rounded-lg border border-white/10 bg-[#0f0f0f] px-4 py-3 text-sm text-white outline-none transition focus:border-[#89aeb6]/70 focus:ring-2 focus:ring-[#89aeb6]/20"
              />
              <button
                type="submit"
                disabled={!input.trim() || isSending}
                className="h-12 rounded-lg border border-white/10 bg-white px-5 text-sm font-medium text-[#0f0f0f] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/25 disabled:text-white/45"
              >
                Send
              </button>
            </div>
          </form>
        </section>

        <aside className="md:w-[30%]">
          <div className="rounded-lg border border-white/10 bg-[#151515]/90 p-5 shadow-[0_0_45px_rgba(137,174,182,0.22)]">
            <h2 className="text-base font-semibold tracking-normal">
              How I see you so far
            </h2>
            <div className="mt-6 space-y-6">
              {dimensionScores === null ? (
                <div className="text-sm italic text-white/45">
                  Still learning...
                </div>
              ) : (
                DIMENSION_CONFIG.map((dim) => {
                  const score = dimensionScores[dim.key];
                  const isDeleted = deletedDimensions.has(dim.key);
                  const isRebuilding = score === null && !isDeleted;
                  const isEditing = editingDimension === dim.key;

                  if (isDeleted) {
                    return (
                      <div key={dim.key} className="space-y-1.5 opacity-40">
                        <div className="flex items-center justify-between text-[10px] text-white/35">
                          <span>{dim.leftPole} → {dim.rightPole}</span>
                          <button
                            onClick={() => handleRestore(dim.key)}
                            className="text-[10px] text-white/40 underline transition-colors hover:text-white/70"
                          >
                            Restore
                          </button>
                        </div>
                        <p className="text-[10px] italic text-white/25">Ignored by Counterpart</p>
                      </div>
                    );
                  }

                  if (isRebuilding) {
                    return (
                      <div key={dim.key} className="space-y-1.5 opacity-50">
                        <div className="flex items-center justify-between text-[10px] text-white/35">
                          <span>{dim.leftPole}</span>
                          <span>{dim.rightPole}</span>
                        </div>
                        <div className="relative h-px w-full bg-white/15">
                          <div className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" style={{ left: "50%" }} />
                        </div>
                        <p className="text-[10px] italic text-white/30">Rebuilding from your next messages</p>
                      </div>
                    );
                  }

                  // isDeleted and isRebuilding are both false here, so score is a number
                  const activeScore = score as number;

                  if (isEditing) {
                    return (
                      <div key={dim.key} className="space-y-2">
                        <div className="flex items-center justify-between text-[10px] text-white/35">
                          <span>{dim.leftPole}</span>
                          <span>{dim.rightPole}</span>
                        </div>
                        <DimensionBar score={activeScore} range={dim.range} />
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="range"
                            min={dim.range[0]}
                            max={dim.range[1]}
                            step={0.01}
                            value={activeScore}
                            onChange={(e) =>
                              handleScoreChange(dim.key, parseFloat(e.target.value))
                            }
                            className="flex-1 accent-[#89aeb6]"
                          />
                          <input
                            type="number"
                            min={dim.range[0]}
                            max={dim.range[1]}
                            step={0.01}
                            value={activeScore.toFixed(2)}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v)) {
                                handleScoreChange(
                                  dim.key,
                                  Math.max(dim.range[0], Math.min(dim.range[1], v)),
                                );
                              }
                            }}
                            className="w-16 rounded border border-white/10 bg-[#0f0f0f] px-2 py-1 text-[11px] text-white outline-none focus:border-[#89aeb6]/70"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => setEditingDimension(null)}
                            className="text-[10px] text-[#89aeb6] transition-colors hover:text-[#9bc4cc]"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={dim.key} className="group space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-white/35">
                        <span>{dim.leftPole}</span>
                        <div className="flex items-center gap-2.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => setEditingDimension(dim.key)}
                            className="text-white/40 transition-colors hover:text-white/80"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(dim.key)}
                            className="text-white/30 transition-colors hover:text-red-400/70"
                          >
                            ×
                          </button>
                        </div>
                        <span>{dim.rightPole}</span>
                      </div>
                      <DimensionBar score={activeScore} range={dim.range} />
                      <p className="text-[10px] italic text-white/40">
                        {getDimensionSubtitle(dim.key, activeScore)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
