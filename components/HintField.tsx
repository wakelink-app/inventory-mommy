"use client";

import { Loader2, Mic, MicOff } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api } from "@/lib/client";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/ogg;codecs=opus",
];

const SILENCE_FLUSH_MS = 420;
const MAX_CHUNK_MS = 1300;

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

function getSpeechRecognition(): BrowserSpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extForMime(mime: string) {
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "webm";
}

function rmsFromTimeDomain(data: Uint8Array) {
  let sum = 0;
  for (const value of data) {
    const n = (value - 128) / 128;
    sum += n * n;
  }
  return Math.sqrt(sum / Math.max(data.length, 1));
}

export type HintFieldHandle = {
  stopListening: () => Promise<void>;
};

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
  const [transcribing, setTranscribing] = useState(false);
  const [interim, setInterim] = useState("");
  const [speechError, setSpeechError] = useState("");
  const valueRef = useRef(value);
  const listeningRef = useRef(false);
  const liveRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const flushLockRef = useRef<Promise<void> | null>(null);
  const inFlightRef = useRef(0);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      liveRecognitionRef.current?.stop();
      teardownAudio(false);
    };
  }, []);

  function appendTranscript(chunk: string) {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    const base = valueRef.current.trim();
    const next = base ? `${base} ${trimmed}` : trimmed;
    valueRef.current = next;
    setInterim("");
    onChange(next);
  }

  function clearSilenceWatch() {
    if (silenceTimerRef.current != null) {
      window.clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function teardownAudio(keepListening: boolean) {
    clearSilenceWatch();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // already stopped
      }
    }
    if (!keepListening) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      void audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }

  function startSilenceWatch() {
    const stream = streamRef.current;
    if (!stream) return;
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const context = audioContextRef.current ?? new AudioCtx();
    audioContextRef.current = context;
    void context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(analyser);
    analyser.connect(mute);
    mute.connect(context.destination);
    const samples = new Uint8Array(analyser.fftSize);
    let heardSpeech = false;
    let silentMs = 0;
    let spokenMs = 0;

    clearSilenceWatch();
    silenceTimerRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      const rms = rmsFromTimeDomain(samples);
      if (rms > 0.028) {
        heardSpeech = true;
        silentMs = 0;
        spokenMs += 80;
        if (spokenMs >= MAX_CHUNK_MS) {
          spokenMs = 0;
          void flushChunk(true);
        }
        return;
      }
      if (!heardSpeech || !listeningRef.current) return;
      silentMs += 80;
      if (silentMs >= SILENCE_FLUSH_MS) {
        heardSpeech = false;
        silentMs = 0;
        spokenMs = 0;
        void flushChunk(true);
      }
    }, 80);
  }

  function startRecorder() {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = pickMime();
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorderRef.current = recorder;
    recorder.start(120);
  }

  function transcribeBlob(blob: Blob) {
    if (blob.size < 900) return;
    inFlightRef.current += 1;
    setTranscribing(true);
    const form = new FormData();
    form.append("audio", blob, `note.${extForMime(blob.type)}`);
    void api<{ text: string }>("/api/transcribe", {
      method: "POST",
      body: form,
      timeoutMs: 15_000,
    })
      .then((data) => {
        appendTranscript(data.text ?? "");
      })
      .catch((error) => {
        setSpeechError(error instanceof Error ? error.message : "Could not transcribe. Try again.");
      })
      .finally(() => {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        if (inFlightRef.current === 0) setTranscribing(false);
      });
  }

  async function flushChunk(restart: boolean) {
    const pending = flushLockRef.current;
    if (pending) await pending;

    const work = (async () => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        if (restart && listeningRef.current) startRecorder();
        return;
      }

      const blob = await new Promise<Blob>((resolve) => {
        const finish = () => {
          resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        };
        recorder.onstop = finish;
        try {
          recorder.requestData();
        } catch {
          // older browsers
        }
        try {
          recorder.stop();
        } catch {
          finish();
        }
      });
      recorderRef.current = null;
      chunksRef.current = [];

      if (restart && listeningRef.current) startRecorder();
      transcribeBlob(blob);
    })();

    flushLockRef.current = work;
    try {
      await work;
    } finally {
      if (flushLockRef.current === work) flushLockRef.current = null;
    }
  }

  function stopLiveRecognition() {
    const recognition = liveRecognitionRef.current;
    liveRecognitionRef.current = null;
    try {
      recognition?.stop();
    } catch {
      // already stopped
    }
    setInterim("");
  }

  function startLiveRecognition(): boolean {
    const SpeechRecognitionApi = getSpeechRecognition();
    if (!SpeechRecognitionApi) return false;

    const recognition = new SpeechRecognitionApi();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language?.startsWith("en") ? navigator.language : "en-US";
    recognition.onresult = (event) => {
      let finals = "";
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i]?.[0]?.transcript ?? "";
        if (event.results[i]?.isFinal) finals += piece;
        else live += piece;
      }
      if (finals) appendTranscript(finals);
      setInterim(live.trim());
    };
    recognition.onerror = (event) => {
      const code = event.error ?? "";
      if (code === "aborted" || code === "no-speech") return;
      if (!listeningRef.current) return;
      stopLiveRecognition();
      if (code === "not-allowed") {
        listeningRef.current = false;
        setListening(false);
        setSpeechError("Allow the microphone, then tap the mic again.");
        return;
      }
      void startRecorderFallback();
    };
    recognition.onend = () => {
      if (!listeningRef.current || liveRecognitionRef.current !== recognition) return;
      try {
        recognition.start();
      } catch {
        void startRecorderFallback();
      }
    };
    liveRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      liveRecognitionRef.current = null;
      return false;
    }
    return true;
  }

  async function waitForInFlight() {
    const started = Date.now();
    while (inFlightRef.current > 0 && Date.now() - started < 8000) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  }

  async function stopListening(): Promise<void> {
    listeningRef.current = false;
    setListening(false);
    setSpeechError("");
    if (liveRecognitionRef.current) {
      stopLiveRecognition();
      return;
    }
    await flushChunk(false);
    teardownAudio(false);
    await waitForInFlight();
  }

  async function startRecorderFallback() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setSpeechError("This browser cannot record audio. Use Chrome or Safari, or type the note.");
      listeningRef.current = false;
      setListening(false);
      return;
    }
    stopLiveRecognition();
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      }
      startRecorder();
      startSilenceWatch();
    } catch {
      setSpeechError("Could not open the microphone. Try again or type the note.");
      listeningRef.current = false;
      setListening(false);
    }
  }

  async function startListening() {
    if (!window.isSecureContext) {
      setSpeechError("Microphone needs https or localhost. Open this app that way, then try again.");
      return;
    }

    setSpeechError("");
    setInterim("");
    listeningRef.current = true;
    setListening(true);

    try {
      if (startLiveRecognition()) return;
      await startRecorderFallback();
    } catch (error) {
      listeningRef.current = false;
      setListening(false);
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setSpeechError("Allow the microphone, then tap the mic again.");
        return;
      }
      setSpeechError("Could not start speech-to-text. Try again or type the note.");
    }
  }

  function toggleListen() {
    if (listeningRef.current) {
      void stopListening();
      return;
    }
    void startListening();
  }

  useImperativeHandle(ref, () => ({ stopListening }), []);

  const shownValue = interim ? `${value.trim() ? `${value.trim()} ` : ""}${interim}` : value;

  return (
    <div className={className}>
      <div className="relative">
        <textarea
          className="field min-h-28 pr-12"
          rows={rows}
          placeholder={placeholder}
          value={shownValue}
          onChange={(e) => {
            setInterim("");
            onChange(e.target.value);
          }}
        />
        <button
          type="button"
          className={`absolute bottom-2 right-2 rounded-lg p-2 ${
            listening
              ? "bg-[#fff1f1] text-[#b42318]"
              : "bg-[var(--wash)] text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
          aria-label={listening ? "Stop listening" : "Speak your note"}
          aria-pressed={listening}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleListen}
        >
          {transcribing && !interim ? (
            <Loader2 size={18} className="animate-spin" />
          ) : listening ? (
            <MicOff size={18} />
          ) : (
            <Mic size={18} />
          )}
        </button>
      </div>
      {listening && (
        <p className="mt-1 text-xs text-[var(--accent)]">
          {interim ? "Listening…" : transcribing ? "Catching up…" : "Listening… talk now."}
        </p>
      )}
      {speechError && <p className="mt-1 text-xs text-[var(--muted)]">{speechError}</p>}
    </div>
  );
});
