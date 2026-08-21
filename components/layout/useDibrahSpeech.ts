'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionResultLike = ArrayLike<{ transcript: string }> & { isFinal?: boolean };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { resultIndex?: number; results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function collectDibrahSpeechResult(
  event: { resultIndex?: number; results: ArrayLike<SpeechRecognitionResultLike> },
  deliveredFinalIndexes: Map<number, string>,
) {
  const finalSegments: string[] = [];
  const interimParts: string[] = [];
  const firstIndex = event.resultIndex ?? 0;
  for (let index = firstIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = result?.[0]?.transcript?.trim() ?? '';
    if (!transcript) continue;
    if (result.isFinal) {
      if (deliveredFinalIndexes.get(index) === transcript) continue;
      deliveredFinalIndexes.set(index, transcript);
      finalSegments.push(transcript);
    } else {
      interimParts.push(transcript);
    }
  }
  return { finalSegments, interimTranscript: interimParts.join(' ').trim() };
}

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
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef(onTranscript);
  const listeningIntentRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const startRunRef = useRef<() => void>(() => undefined);
  const lastFinalRef = useRef('');

  useEffect(() => {
    transcriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    queueMicrotask(() => {
      if (!getRecognitionCtor()) setStatus('unsupported');
    });
  }, []);

  const startRecognitionRun = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      listeningIntentRef.current = false;
      setStatus('unsupported');
      return;
    }

    const recognition = new Ctor();
    const deliveredFinalIndexes = new Map<number, string>();
    recognition.lang = language === 'ar' ? 'ar-SA' : 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      const collected = collectDibrahSpeechResult(event, deliveredFinalIndexes);
      for (const transcript of collected.finalSegments) {
        if (lastFinalRef.current !== transcript) {
          lastFinalRef.current = transcript;
          transcriptRef.current(transcript);
        }
      }
      setInterimTranscript(collected.interimTranscript);
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        listeningIntentRef.current = false;
        setStatus('denied');
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setInterimTranscript('');
      if (listeningIntentRef.current) {
        restartTimerRef.current = window.setTimeout(() => startRunRef.current(), 250);
      } else {
        setStatus((previous) => (previous === 'listening' ? 'idle' : previous));
      }
    };

    try {
      recognitionRef.current = recognition;
      recognition.start();
      setStatus('listening');
    } catch {
      recognitionRef.current = null;
      listeningIntentRef.current = false;
      setStatus('idle');
    }
  }, [language]);

  useEffect(() => {
    startRunRef.current = startRecognitionRun;
  }, [startRecognitionRun]);

  const stopListening = useCallback(() => {
    listeningIntentRef.current = false;
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setInterimTranscript('');
    setStatus((previous) => (previous === 'listening' ? 'idle' : previous));
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current || listeningIntentRef.current) {
      stopListening();
      return;
    }
    listeningIntentRef.current = true;
    lastFinalRef.current = '';
    startRunRef.current();
  }, [stopListening]);

  useEffect(() => () => {
    listeningIntentRef.current = false;
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    recognitionRef.current?.abort();
  }, []);

  return { status, interimTranscript, startListening, stopListening };
}
