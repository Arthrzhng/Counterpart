"use client";

import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ProfileTrait = {
  label: string;
  description: string;
};

type Profile = {
  trait1: ProfileTrait;
  trait2: ProfileTrait;
  trait3: ProfileTrait;
};

const DEFAULT_PROFILE: Profile = {
  trait1: {
    label: "",
    description: "",
  },
  trait2: {
    label: "",
    description: "",
  },
  trait3: {
    label: "",
    description: "",
  },
};

const PROFILE_PATTERN = /<profile>\s*([\s\S]*?)\s*<\/profile>/;

function parseAssistantResponse(content: string) {
  const profileMatch = content.match(PROFILE_PATTERN);

  if (!profileMatch) {
    return { displayContent: content.trim(), profile: null };
  }

  const displayContent = content.replace(PROFILE_PATTERN, "").trim();

  try {
    const parsed = JSON.parse(profileMatch[1]) as Record<string, unknown>;

    const trait1 = parseProfileTrait(parsed.trait1);
    const trait2 = parseProfileTrait(parsed.trait2);
    const trait3 = parseProfileTrait(parsed.trait3);

    if (trait1 && trait2 && trait3) {
      return {
        displayContent,
        profile: { trait1, trait2, trait3 },
      };
    }
  } catch {
    return { displayContent, profile: null };
  }

  return { displayContent, profile: null };
}

function parseProfileTrait(value: unknown): ProfileTrait | null {
  if (typeof value === "string") {
    return {
      label: value,
      description: "Counterpart is still forming the explanation behind this pattern.",
    };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.label === "string" &&
    typeof candidate.description === "string"
  ) {
    return {
      label: candidate.label,
      description: candidate.description,
    };
  }

  return null;
}

function newMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const traitEntries = useMemo<Array<[string, ProfileTrait]>>(
    () => [
      ["trait1", profile.trait1],
      ["trait2", profile.trait2],
      ["trait3", profile.trait3],
    ],
    [profile],
  );

  async function sendMessage() {
    const trimmed = input.trim();

    if (!trimmed || isSending) {
      return;
    }

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
          currentProfile: profile,
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.message) {
        throw new Error(data.error || "Counterpart could not respond.");
      }

      const { displayContent, profile: nextProfile } = parseAssistantResponse(
        data.message,
      );

      if (nextProfile) {
        setProfile(nextProfile);
      }

      setMessages((current) => [
        ...current,
        {
          id: newMessageId(),
          role: "assistant",
          content: displayContent || "I am here, but I do not have words for that yet.",
        },
      ]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong.",
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
            <div className="mt-6 space-y-5">
              {traitEntries.map(([key, trait], index) => (
                <div
                  key={key}
                  className="rounded-lg border border-l-2 border-white/10 border-l-blue-500 bg-white/[0.035] px-4 py-4 transition duration-500 ease-out"
                >
                  <div className="text-xs uppercase text-white/35">
                    Trait {index + 1}
                  </div>
                  <div
                    key={`${trait.label}-${trait.description}`}
                    className="trait-rise mt-3 transition-all duration-500 ease-out"
                  >
                    {trait.label ? (
                      <>
                        <div className="font-semibold text-white">
                          {trait.label}
                        </div>
                        <p className="mt-2 text-sm leading-5 text-gray-400">
                          {trait.description}
                        </p>
                      </>
                    ) : (
                      <div className="text-sm italic text-white/45">
                        Still learning...
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
