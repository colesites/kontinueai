import type { SpeechRecognitionInstance } from "./speech-recognition";

export type MutableRef<T> = { current: T };

export type SpeechInputRunnerRefs = {
  recognitionRef: MutableRef<SpeechRecognitionInstance | null>;
  languageRotateTimerRef: MutableRef<number | null>;
  autoDetectModeRef: MutableRef<boolean>;
  keepListeningRef: MutableRef<boolean>;
  languageCandidatesRef: MutableRef<string[]>;
  languageIndexRef: MutableRef<number>;
  hasFinalResultRef: MutableRef<boolean>;
  hasConfidenceScoreRef: MutableRef<boolean>;
  bestConfidenceRef: MutableRef<number>;
  finalTranscriptCharsRef: MutableRef<number>;
  forceAdvanceLanguageRef: MutableRef<boolean>;
  speechBaseTextRef: MutableRef<string>;
  speechFinalTextRef: MutableRef<string>;
};

export type RunSpeechRecognitionCycleArgs = {
  startIndex: number;
  refs: SpeechInputRunnerRefs;
  clearLanguageRotateTimer: () => void;
  shouldKeepCurrentLanguage: () => boolean;
  stopListening: () => void;
  setInputValue: (value: string) => void;
  setActiveRecognitionLanguage: (value: string | null) => void;
};
