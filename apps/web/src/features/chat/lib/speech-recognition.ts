import {
  SPEECH_AUTO_LANGUAGE,
  SPEECH_LANGUAGE_OPTIONS,
} from "@repo/core/speech-settings";

export type SpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

export type SpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
};

export type SpeechRecognitionResultList = {
  length: number;
  [index: number]: SpeechRecognitionResult;
};

export type SpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

export type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
};

export type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export const LANGUAGE_ROTATE_INTERVAL_MS = 9000;
export const MIN_CONFIDENCE_TO_LOCK_LANGUAGE = 0.72;
export const MIN_TRANSCRIPT_CHARS_TO_LOCK_WITHOUT_CONFIDENCE = 36;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const withSpeech = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return (
    withSpeech.SpeechRecognition ?? withSpeech.webkitSpeechRecognition ?? null
  );
}

export function buildSpeechLanguageCandidates(preferredLanguage: string): string[] {
  const candidates: string[] = [];
  const push = (value?: string | null) => {
    if (!value) return;
    if (!candidates.includes(value)) candidates.push(value);
  };
  const isEnglishVariant = (value: string) =>
    value.toLowerCase().startsWith("en-");

  if (preferredLanguage && preferredLanguage !== SPEECH_AUTO_LANGUAGE) {
    return [preferredLanguage];
  }

  const browserCandidates: string[] = [];
  const pushBrowser = (value?: string | null) => {
    if (!value) return;
    if (!browserCandidates.includes(value)) browserCandidates.push(value);
  };

  if (typeof navigator !== "undefined") {
    pushBrowser(navigator.language);
    for (const language of navigator.languages ?? []) {
      pushBrowser(language);
    }
  }

  const browserHasNonEnglish = browserCandidates.some(
    (value) => !isEnglishVariant(value),
  );
  if (browserHasNonEnglish) {
    for (const value of browserCandidates) push(value);
  } else {
    for (const value of browserCandidates) {
      if (!isEnglishVariant(value)) push(value);
    }
  }

  const allKnownLanguages = SPEECH_LANGUAGE_OPTIONS.map(
    (option) => option.value,
  ).filter((value) => value !== SPEECH_AUTO_LANGUAGE);

  const remaining = allKnownLanguages.filter(
    (value) => !candidates.includes(value),
  );
  const nonEnglish = remaining.filter((value) => !isEnglishVariant(value));
  const english = remaining.filter((value) => isEnglishVariant(value));
  const browserEnglish = browserCandidates.filter((value) =>
    isEnglishVariant(value),
  );

  const pushOneVariantPerBase = (values: string[]) => {
    const seenBase = new Set<string>();
    for (const value of values) {
      const base = value.split("-")[0] ?? value;
      if (seenBase.has(base)) continue;
      seenBase.add(base);
      push(value);
    }
  };

  pushOneVariantPerBase(nonEnglish);
  pushOneVariantPerBase(browserEnglish);
  pushOneVariantPerBase(english);

  return candidates.length > 0 ? candidates : ["en-US"];
}

export function mergeSpeechText(base: string, spoken: string): string {
  const normalizedBase = base.trim();
  const normalizedSpoken = spoken.trim();
  if (!normalizedSpoken) return normalizedBase;
  if (!normalizedBase) return normalizedSpoken;
  return `${normalizedBase} ${normalizedSpoken}`;
}
