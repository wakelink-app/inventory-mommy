"use client";

import { Mic, MicOff } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{ isFinal?: boolean; 0?: { transcript?: string } }>;
      }) => void)
    | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

export type HintFieldHandle = {
  stopListening: () => Promise<void>;
};

function getSpeechRecognition(): BrowserSpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function isBenignSpeechError(code: string) {
  return code === "aborted" || code === "no-speech";
}

export const HintField = forwardRef<
  HintFieldHandle,
  {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
    className?: string;
  }
>(function HintField({ value, onChange, placeholder, rows = 5, className = "" }, ref) {
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const valueRef = useRef(value);
  const intentionalStopRef = useRef(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      intentionalStopRef.current = true;
      recognitionRef.current?.stop();
    };
  }, []);

  function appendTranscript(chunk: string) {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    const base = valueRef.current.trim();
    const next = base ? `${base} ${trimmed}` : trimmed;
    valueRef.current = next;
    onChange(next);
  }

  function stopListening(): Promise<void> {
    return new Promise((resolve) => {
      if (!recognitionRef.current) {
        setListening(false);
        setSpeechError("");
        resolve();
        return;
      }

      intentionalStopRef.current = true;
      const recognition = recognitionRef.current;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const previousOnEnd = recognition.onend;
      recognition.onend = () => {
        setListening(false);
        intentionalStopRef.current = false;
        previousOnEnd?.();
        finish();
      };

      recognition.stop();
      setListening(false);
      setSpeechError("");
      window.setTimeout(finish, 250);
    });
  }

  useImperativeHandle(ref, () => ({ stopListening }), []);

  function toggleListen() {
    const SpeechRecognitionApi = getSpeechRecognition();
    if (!SpeechRecognitionApi) {
      setSpeechError("Speech-to-text is not supported in this browser. Type your note instead.");
      return;
    }

    if (listening) {
      stopListening();
      return;
    }

    setSpeechError("");
    intentionalStopRef.current = false;
    const recognition = new SpeechRecognitionApi();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let chunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i]?.isFinal) {
          chunk += event.results[i][0]?.transcript ?? "";
        }
      }
      appendTranscript(chunk);
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (intentionalStopRef.current || isBenignSpeechError(event.error ?? "")) return;
      if (event.error === "not-allowed") {
        setSpeechError("Microphone access denied. Type your note instead.");
        return;
      }
      setSpeechError("Could not hear you. Try again or type instead.");
    };
    recognition.onend = () => {
      setListening(false);
      intentionalStopRef.current = false;
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  return (
    <div className={className}>
      <div className="relative">
        <textarea
          className="field min-h-28 pr-12"
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => stopListening()}
        />
        <button
          type="button"
          className={`absolute bottom-2 right-2 rounded-lg p-2 ${
            listening
              ? "bg-[#fff1f1] text-[#b42318]"
              : "bg-[var(--wash)] text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
          aria-label={listening ? "Stop listening" : "Speak your note"}
          onClick={toggleListen}
        >
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
      </div>
      {listening && <p className="mt-1 text-xs text-[var(--accent)]">Listening… tap the mic when you’re done.</p>}
      {speechError && <p className="mt-1 text-xs text-[var(--muted)]">{speechError}</p>}
    </div>
  );
});
