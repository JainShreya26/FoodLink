"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ToolCall = { tool: string; args: Record<string, unknown> };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  calls?: ToolCall[];
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    const history = [...messages, { role: "user" as const, content: q }];
    setMessages(history);
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat failed");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, calls: data.calls },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div>
        <h1 className="text-2xl font-bold">Chat with your inventory</h1>
        <p className="text-sm text-stone-500">
          Ask anything about {bankName}&apos;s stock.
        </p>
      </div>

      <div className="mt-4 flex-1 space-y-4 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4">
        {messages.length === 0 && (
          <div className="mt-8 text-center text-sm text-stone-400">
            Try one of the suggestions below, or ask your own question.
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
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-stone-100 px-4 py-2 text-sm text-stone-400">
              Thinking…
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
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
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your inventory…"
            className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
