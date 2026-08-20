'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type SttStatus = 'idle' | 'listening' | 'denied' | 'unsupported';

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Browser-native speech-to-text for the DABRA composer. No external provider. */
export function useDibrahSpeech(language: 'ar' | 'en', onTranscript: (text: string) => void) {
  const [status, setStatus] = useState<SttStatus>('idle');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef(onTranscript);

  useEffect(() => {
    transcriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    queueMicrotask(() => {
      if (!getRecognitionCtor()) setStatus('unsupported');
    });
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setStatus((previous) => (previous === 'listening' ? 'idle' : previous));
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setStatus('unsupported');
      return;
    }
    if (recognitionRef.current) {
      stopListening();
      return;
    }

    const recognition = new Ctor();
    recognition.lang = language === 'ar' ? 'ar-SA' : 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? '';
      if (transcript.trim()) transcriptRef.current(transcript.trim());
    };
    recognition.onerror = (event) => {
      setStatus(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'denied' : 'idle');
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setStatus((previous) => (previous === 'listening' ? 'idle' : previous));
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setStatus('listening');
    } catch {
      setStatus('idle');
    }
  }, [language, stopListening]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { status, startListening, stopListening };
}
