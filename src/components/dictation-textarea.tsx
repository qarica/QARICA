"use client";

import { useEffect, useRef, useState } from "react";

type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

type DictationTextareaProps = {
  value: string;
  onValueChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  language?: string;
  ariaLabel?: string;
};

function appendTranscript(current: string, transcript: string) {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript) return current;
  const base = current.trimEnd();
  return base ? `${base} ${cleanTranscript}` : cleanTranscript;
}

export function DictationTextarea({
  value,
  onValueChange,
  rows = 3,
  disabled = false,
  placeholder,
  className,
  language = "vi-VN",
  ariaLabel,
}: DictationTextareaProps) {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const valueRef = useRef(value);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: BrowserSpeechRecognitionCtor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
    };
    setSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));

    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  function stop() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function start() {
    if (disabled || listening) return;

    const speechWindow = window as typeof window & {
      SpeechRecognition?: BrowserSpeechRecognitionCtor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setError("Trình duyệt này chưa hỗ trợ nhập bằng giọng nói.");
      return;
    }

    setError("");
    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) finalText += ` ${result[0]?.transcript || ""}`;
      }
      if (finalText.trim()) {
        const nextValue = appendTranscript(valueRef.current, finalText);
        valueRef.current = nextValue;
        onValueChange(nextValue);
      }
    };
    recognition.onerror = () => {
      setError("Không nhận được giọng nói. Kiểm tra quyền micro rồi thử lại.");
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  return (
    <div className="dictation-textarea">
      <textarea
        rows={rows}
        disabled={disabled}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className={className}
        aria-label={ariaLabel}
      />
      <div className="dictation-actions">
        {supported ? (
          <button
            type="button"
            className={listening ? "button tertiary small" : "button secondary small"}
            disabled={disabled}
            onClick={listening ? stop : start}
            aria-pressed={listening}
          >
            {listening ? "Dừng ghi âm" : "🎙 Nhập bằng giọng nói"}
          </button>
        ) : (
          <span className="dictation-help">Nhập giọng nói hỗ trợ trên Chrome/Edge có Web Speech API.</span>
        )}
        {listening ? (
          <span className="dictation-listening">Đang nghe… Nội dung chỉ được chèn vào ô, không tự lưu.</span>
        ) : null}
      </div>
      {error ? <div className="dictation-error">{error}</div> : null}
      <style>{`
        .dictation-textarea{display:grid;gap:6px}
        .dictation-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .dictation-help,.dictation-listening{font-size:9px;color:#64748b}
        .dictation-listening{font-weight:700}
        .dictation-error{font-size:10px;color:#b42318}
      `}</style>
    </div>
  );
}
