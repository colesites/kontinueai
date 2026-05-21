import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  type SpeechRecognitionInstance,
  getSpeechRecognitionConstructor,
  MIN_CONFIDENCE_TO_LOCK_LANGUAGE,
  MIN_TRANSCRIPT_CHARS_TO_LOCK_WITHOUT_CONFIDENCE,
} from "../lib/speech-recognition";
import {
  initializeSpeechSession,
  runSpeechRecognitionCycle,
} from "../lib/speech-input-runner";
import { useSpeechPreference } from "./useSpeechPreference";
import { SPEECH_AUTO_LANGUAGE } from "@repo/core/speech-settings";

export function useSpeechInput({
  inputValue,
  setInputValue,
}: {
  inputValue: string;
  setInputValue: (value: string) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [activeRecognitionLanguage, setActiveRecognitionLanguage] = useState<
    string | null
  >(null);
  const preferredSpeechLanguage = useSpeechPreference();

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const languageRotateTimerRef = useRef<number | null>(null);
  const autoDetectModeRef = useRef(false);
  const keepListeningRef = useRef(false);
  const languageCandidatesRef = useRef<string[]>([]);
  const languageIndexRef = useRef(0);
  const hasFinalResultRef = useRef(false);
  const hasConfidenceScoreRef = useRef(false);
  const bestConfidenceRef = useRef(0);
  const finalTranscriptCharsRef = useRef(0);
  const forceAdvanceLanguageRef = useRef(false);
  const speechBaseTextRef = useRef("");
  const speechFinalTextRef = useRef("");

  const speechSupported = useMemo(
    () => getSpeechRecognitionConstructor() !== null,
    [],
  );

  const clearLanguageRotateTimer = useCallback(() => {
    if (languageRotateTimerRef.current !== null) {
      window.clearTimeout(languageRotateTimerRef.current);
      languageRotateTimerRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    keepListeningRef.current = false;
    autoDetectModeRef.current = false;
    clearLanguageRotateTimer();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    forceAdvanceLanguageRef.current = false;
    setIsListening(false);
    setActiveRecognitionLanguage(null);
  }, [clearLanguageRotateTimer]);

  const shouldKeepCurrentLanguage = useCallback(() => {
    if (!hasFinalResultRef.current) return false;
    if (hasConfidenceScoreRef.current) {
      return bestConfidenceRef.current >= MIN_CONFIDENCE_TO_LOCK_LANGUAGE;
    }
    return (
      finalTranscriptCharsRef.current >=
      MIN_TRANSCRIPT_CHARS_TO_LOCK_WITHOUT_CONFIDENCE
    );
  }, []);

  const startRecognitionWithLanguage = useCallback(
    (languageIndex: number) => {
      runSpeechRecognitionCycle({
        startIndex: languageIndex,
        refs: {
          recognitionRef,
          languageRotateTimerRef,
          autoDetectModeRef,
          keepListeningRef,
          languageCandidatesRef,
          languageIndexRef,
          hasFinalResultRef,
          hasConfidenceScoreRef,
          bestConfidenceRef,
          finalTranscriptCharsRef,
          forceAdvanceLanguageRef,
          speechBaseTextRef,
          speechFinalTextRef,
        },
        clearLanguageRotateTimer,
        shouldKeepCurrentLanguage,
        stopListening,
        setInputValue,
        setActiveRecognitionLanguage,
      });
    },
    [
      clearLanguageRotateTimer,
      setInputValue,
      shouldKeepCurrentLanguage,
      stopListening,
    ],
  );

  const toggleListening = useCallback(() => {
    if (!speechSupported) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    initializeSpeechSession(
      {
        recognitionRef,
        languageRotateTimerRef,
        autoDetectModeRef,
        keepListeningRef,
        languageCandidatesRef,
        languageIndexRef,
        hasFinalResultRef,
        hasConfidenceScoreRef,
        bestConfidenceRef,
        finalTranscriptCharsRef,
        forceAdvanceLanguageRef,
        speechBaseTextRef,
        speechFinalTextRef,
      },
      {
        inputValue,
        preferredSpeechLanguage,
        autoLanguageValue: SPEECH_AUTO_LANGUAGE,
      },
    );
    setIsListening(true);
    void startRecognitionWithLanguage(0);
  }, [
    inputValue,
    isListening,
    preferredSpeechLanguage,
    speechSupported,
    startRecognitionWithLanguage,
    stopListening,
  ]);

  useEffect(() => {
    return () => {
      keepListeningRef.current = false;
      clearLanguageRotateTimer();
      recognitionRef.current?.stop?.();
      recognitionRef.current = null;
    };
  }, [clearLanguageRotateTimer]);

  return {
    isListening,
    activeRecognitionLanguage,
    speechSupported,
    toggleListening,
    stopListening,
  };
}
