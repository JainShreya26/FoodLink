"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Replaces window.confirm/window.prompt.
 *
 * The native dialogs cannot be styled, block the whole tab, and are suppressed
 * outright in some embedded contexts — which would silently swallow a removal
 * reason. This keeps the same await-a-answer shape at the call site:
 *
 *   const note = await dialog.prompt({ title: "Remove …", … });
 *   if (note === null) return;   // cancelled
 */

type ConfirmOptions = {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

type PromptOptions = ConfirmOptions & {
  label: string;
  placeholder?: string;
  defaultValue?: string;
  /** Block confirming until something is typed. */
  required?: boolean;
};

type Pending =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void };

type DialogApi = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error("useDialog must be used inside <DialogProvider>");
  return api;
}

export default function DialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setValue("");
        setPending({ kind: "confirm", opts, resolve });
      }),
    [],
  );

  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.defaultValue ?? "");
        setPending({ kind: "prompt", opts, resolve });
      }),
    [],
  );

  const close = useCallback(
    (confirmed: boolean) => {
      setPending((current) => {
        if (!current) return null;
        if (current.kind === "confirm") current.resolve(confirmed);
        else current.resolve(confirmed ? value : null);
        return null;
      });
    },
    [value],
  );

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {pending && (
        <DialogSurface
          pending={pending}
          value={value}
          onValueChange={setValue}
          onClose={close}
        />
      )}
    </DialogContext.Provider>
  );
}

function DialogSurface({
  pending,
  value,
  onValueChange,
  onClose,
}: {
  pending: Pending;
  value: string;
  onValueChange: (v: string) => void;
  onClose: (confirmed: boolean) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const { opts } = pending;
  const isPrompt = pending.kind === "prompt";
  const blocked = isPrompt && (opts as PromptOptions).required && !value.trim();

  // Escape cancels, and Tab is kept inside the panel while it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        "button, input, [href], select, textarea",
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    (isPrompt ? inputRef.current : confirmRef.current)?.focus();
  }, [isPrompt]);

  const danger = opts.tone === "danger";

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-4 backdrop-blur-[1px] sm:items-center"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id="dialog-title" className="text-base font-semibold text-stone-900">
          {opts.title}
        </h2>
        {opts.body && (
          <div className="mt-1.5 text-sm text-stone-600">{opts.body}</div>
        )}

        {isPrompt && (
          <div className="mt-3">
            <label
              htmlFor="dialog-input"
              className="text-xs font-medium text-stone-600"
            >
              {(opts as PromptOptions).label}
            </label>
            <input
              id="dialog-input"
              ref={inputRef}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !blocked) onClose(true);
              }}
              placeholder={(opts as PromptOptions).placeholder}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
          >
            {opts.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={() => onClose(true)}
            disabled={blocked}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40 ${
              danger
                ? "bg-red-600 hover:bg-red-500"
                : "bg-emerald-700 hover:bg-emerald-600"
            }`}
          >
            {opts.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
