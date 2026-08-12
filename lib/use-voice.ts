"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Speech in and speech out, using the browser's own engines.
 *
 * Deliberately not a streaming voice model: recognition and synthesis both run
 * on-device, so there is no audio leaving the building, no extra latency, and
 * no per-minute cost on a warehouse tablet that is already open on this page.
 * The trade is browser support — SpeechRecognition is Chrome/Edge/Safari only,
 * so `supported` is checked before any of this is offered.
 */

// The spec is still prefixed everywhere that implements it.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceState = "idle" | "listening" | "speaking";

/** Capability support never changes within a session, so there is nothing to subscribe to. */
const subscribeNever = () => () => {};

export function useVoice({
  onTranscript,
  onEnd,
}: {
  /** Called once per finished utterance. */
  onTranscript: (text: string) => void;
  /** Called after speech output finishes, for hands-free turn-taking. */
  onEnd?: () => void;
}) {
  // A browser capability, not state: read through useSyncExternalStore so the
  // server renders "unsupported" and the client corrects it without a
  // setState-in-effect round trip or a hydration mismatch.
  const supported = useSyncExternalStore(
    subscribeNever,
    () => recognitionCtor() !== null && "speechSynthesis" in window,
    () => false,
  );
  const [state, setState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  // Kept in refs so the recognition callbacks, bound once, always see the latest.
  const transcriptRef = useRef(onTranscript);
  const endRef = useRef(onEnd);
  useEffect(() => {
    transcriptRef.current = onTranscript;
    endRef.current = onEnd;
  }, [onTranscript, onEnd]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;

    // Never listen while the page is talking, or it transcribes its own voice.
    window.speechSynthesis?.cancel();

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    finalRef.current = "";
    setError(null);

    recognition.onstart = () => {
      setState("listening");
      setInterim("");
    };

    recognition.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const result = e.results[i];
        const text = result[0].transcript;
        if (result.isFinal) finalRef.current += text;
        else live += text;
      }
      setInterim(live);
    };

    recognition.onerror = (e) => {
      // "aborted" and "no-speech" are ordinary outcomes, not failures worth
      // shouting about — the user tapped off, or simply said nothing.
      if (e.error === "aborted" || e.error === "no-speech") return;
      setError(
        e.error === "not-allowed"
          ? "Microphone access was blocked. Allow it in your browser settings to use voice."
          : `Could not hear you (${e.error}).`,
      );
    };

    recognition.onend = () => {
      setState("idle");
      setInterim("");
      recognitionRef.current = null;
      const said = finalRef.current.trim();
      if (said) transcriptRef.current(said);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // start() throws if one is already running; harmless.
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const clean = text.trim();
    if (!clean) {
      endRef.current?.();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.03;
    utterance.pitch = 1;

    // Prefer a natural local English voice where one exists; the default on
    // some platforms is markedly robotic.
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /Samantha|Google US English|Microsoft Aria/i.test(v.name)) ??
      voices.find((v) => v.lang?.startsWith("en") && v.localService) ??
      voices.find((v) => v.lang?.startsWith("en"));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setState("speaking");
    utterance.onend = () => {
      setState("idle");
      endRef.current?.();
    };
    utterance.onerror = () => {
      setState("idle");
      endRef.current?.();
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setState("idle");
  }, []);

  // Leaving the page mid-sentence should not keep the mic open or the voice going.
  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    [],
  );

  return {
    supported,
    state,
    interim,
    error,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    clearError: () => setError(null),
  };
}

/**
 * Fallback for when the model didn't supply a spoken rendering: strip the
 * markdown so the synthesiser isn't reading punctuation out loud.
 */
export function toSpeakable(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ") // table rows
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|[*_`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
