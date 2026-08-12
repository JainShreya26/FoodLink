"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toSpeakable, useVoice } from "@/lib/use-voice";

type ToolCall = { tool: string; args: Record<string, unknown> };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  calls?: ToolCall[];
  spoken?: string | null;
};

const TOOL_LABELS: Record<string, string> = {
  list_inventory: "Looked up inventory",
  inventory_totals: "Totalled inventory",
  network_listings: "Checked the network board",
};

const describeArgs = (args: Record<string, unknown>) => {
  const parts = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length > 0 ? parts.join(", ") : "no filters";
};

const SUGGESTIONS = [
  "What expires in the next 2 weeks?",
  "Totals by category",
  "How much protein do we have?",
  "What did we get from Safeway?",
  "What should we move first?",
];

export default function ChatClient({ bankName }: { bankName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Hands-free: speak every answer and reopen the mic when it finishes. */
  const [handsFree, setHandsFree] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Refs because send() is defined before the voice hook it needs to call, and
  // because it must read the latest history without being rebuilt every render.
  const speakRef = useRef<(text: string) => void>(() => {});
  const listenRef = useRef<() => void>(() => {});
  const messagesRef = useRef<ChatMessage[]>([]);
  const busyRef = useRef(false);
  const handsFreeRef = useRef(false);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  const send = useCallback(
    async (question: string, viaVoice = false) => {
      const q = question.trim();
      if (!q || busyRef.current) return;
      setError(null);
      setInput("");
      const history: ChatMessage[] = [
        ...messagesRef.current,
        { role: "user" as const, content: q },
      ];
      setMessages(history);
      setBusy(true);
      try {
        const res = await fetch("/api/inventory/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
            voice: viaVoice || handsFreeRef.current,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Chat failed");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            calls: data.calls,
            spoken: data.spoken ?? null,
          },
        ]);
        if (viaVoice || handsFreeRef.current) {
          speakRef.current(data.spoken || toSpeakable(data.answer));
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Chat failed";
        setError(message);
        if (viaVoice || handsFreeRef.current) speakRef.current(message);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const voice = useVoice({
    onTranscript: (text) => send(text, true),
    // Hands-free turn-taking: once we finish speaking, listen again. The pause
    // gives the synthesiser time to release the audio device first.
    onEnd: () => {
      if (handsFreeRef.current) setTimeout(() => listenRef.current(), 350);
    },
  });

  useEffect(() => {
    speakRef.current = voice.speak;
    listenRef.current = voice.startListening;
  }, [voice.speak, voice.startListening]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const listening = voice.state === "listening";
  const speaking = voice.state === "speaking";

  const toggleMic = () => {
    if (listening) voice.stopListening();
    else if (speaking) voice.stopSpeaking();
    else voice.startListening();
  };

  const toggleHandsFree = () => {
    const next = !handsFree;
    setHandsFree(next);
    if (next) voice.startListening();
    else {
      voice.stopListening();
      voice.stopSpeaking();
    }
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Chat with your inventory</h1>
          <p className="text-sm text-stone-500">
            Ask anything about {bankName}&apos;s stock — type it or say it.
          </p>
        </div>
        {voice.supported && (
          <button
            onClick={toggleHandsFree}
            aria-pressed={handsFree}
            title="Speak your questions and hear the answers back, hands-free"
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              handsFree
                ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-600"
                : "border-stone-300 bg-white text-stone-600 hover:border-emerald-500 hover:text-emerald-700"
            }`}
          >
            {handsFree ? "🎙 Hands-free on" : "🎙 Hands-free"}
          </button>
        )}
      </div>

      <div className="mt-4 flex-1 space-y-4 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4">
        {messages.length === 0 && (
          <div className="mt-8 text-center text-sm text-stone-400">
            Try one of the suggestions below, ask your own question
            {voice.supported ? ", or press the microphone and just talk" : ""}.
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-emerald-700 px-4 py-2 text-sm text-white">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-stone-100 px-4 py-3 text-sm">
                <div className="prose prose-sm prose-stone max-w-none [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:border-stone-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-stone-200 [&_th]:bg-stone-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content}
                  </ReactMarkdown>
                </div>

                {voice.supported && (
                  <button
                    onClick={() =>
                      voice.speak(m.spoken || toSpeakable(m.content))
                    }
                    title="Read this answer aloud"
                    className="mt-1.5 text-xs text-stone-400 hover:text-emerald-700"
                  >
                    🔊 Play
                  </button>
                )}

                {m.calls && m.calls.length > 0 && (
                  <details className="mt-2 text-xs text-stone-400">
                    <summary className="cursor-pointer hover:text-stone-600">
                      {m.calls.length} lookup{m.calls.length === 1 ? "" : "s"} used
                    </summary>
                    <ul className="mt-1 space-y-1">
                      {m.calls.map((c, ci) => (
                        <li
                          key={ci}
                          className="rounded bg-stone-200/60 px-2 py-1 text-[11px] text-stone-600"
                        >
                          <span className="font-medium text-stone-700">
                            {TOOL_LABELS[c.tool] ?? c.tool}
                          </span>{" "}
                          — {describeArgs(c.args)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          ),
        )}

        {listening && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-br-sm border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
              {voice.interim || "Listening…"}
            </div>
          </div>
        )}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-stone-100 px-4 py-2 text-sm text-stone-400">
              Thinking…
            </div>
          </div>
        )}
        {speaking && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-stone-100 px-4 py-2 text-sm text-stone-400">
              🔊 Speaking… <button onClick={voice.stopSpeaking} className="underline">stop</button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {voice.error && (
          <p className="text-sm text-amber-700">
            {voice.error}{" "}
            <button onClick={voice.clearError} className="underline">
              dismiss
            </button>
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={busy}
              className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs text-stone-600 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-2 flex gap-2"
        >
          {voice.supported && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={busy}
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Ask by voice"}
              title={listening ? "Stop listening" : "Ask by voice"}
              className={`shrink-0 rounded-lg px-3 py-2 text-lg disabled:opacity-50 ${
                listening
                  ? "animate-pulse bg-red-600 text-white"
                  : "border border-stone-300 bg-white hover:border-emerald-500"
              }`}
            >
              {listening ? "⏹" : "🎤"}
            </button>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Ask about your inventory"
            placeholder={
              listening ? "Listening…" : "Ask about your inventory…"
            }
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            Send
          </button>
        </form>
        {!voice.supported && (
          <p className="mt-1.5 text-[11px] text-stone-400">
            Voice needs Chrome, Edge or Safari — this browser doesn&apos;t
            support speech recognition.
          </p>
        )}
      </div>
    </div>
  );
}
