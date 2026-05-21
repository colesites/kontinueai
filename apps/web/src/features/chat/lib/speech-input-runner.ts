import { toast } from "sonner";
import {
  buildSpeechLanguageCandidates,
  getSpeechRecognitionConstructor,
  mergeSpeechText,
  LANGUAGE_ROTATE_INTERVAL_MS,
} from "./speech-recognition";
import type {
  RunSpeechRecognitionCycleArgs,
  SpeechInputRunnerRefs,
} from "./speech-input-types";

function resetLanguageTracking(refs: SpeechInputRunnerRefs): void {
  refs.hasFinalResultRef.current = false;
  refs.hasConfidenceScoreRef.current = false;
  refs.bestConfidenceRef.current = 0;
  refs.finalTranscriptCharsRef.current = 0;
  refs.forceAdvanceLanguageRef.current = false;
}

function resolveLanguageCandidate(refs: SpeechInputRunnerRefs, index: number): string {
  return (
    refs.languageCandidatesRef.current[index] ||
    (typeof navigator !== "undefined" ? navigator.language : "en-US")
  );
}

export function runSpeechRecognitionCycle({
  startIndex,
  refs,
  clearLanguageRotateTimer,
  shouldKeepCurrentLanguage,
  stopListening,
  setInputValue,
  setActiveRecognitionLanguage,
}: RunSpeechRecognitionCycleArgs): void {
  const run = (languageIndex: number) => {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      toast.error("Speech recognition is not supported in this browser.");
      stopListening();
      return;
    }

    const language = resolveLanguageCandidate(refs, languageIndex);
    resetLanguageTracking(refs);
    clearLanguageRotateTimer();

    try {
      const recognition = new SpeechRecognitionCtor();
      refs.recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.lang = language;
      refs.languageIndexRef.current = languageIndex;
      setActiveRecognitionLanguage(language);

      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (!result) continue;
          const alternative = result[0];
          if (!alternative) continue;
          const transcript = alternative.transcript?.trim();
          if (!transcript) continue;

          if (result.isFinal) {
            refs.speechFinalTextRef.current =
              `${refs.speechFinalTextRef.current} ${transcript}`.trim();
            refs.hasFinalResultRef.current = true;
            refs.finalTranscriptCharsRef.current += transcript.length;
            if (
              typeof alternative.confidence === "number" &&
              Number.isFinite(alternative.confidence) &&
              alternative.confidence > 0
            ) {
              refs.hasConfidenceScoreRef.current = true;
              refs.bestConfidenceRef.current = Math.max(
                refs.bestConfidenceRef.current,
                alternative.confidence,
              );
            }
          } else {
            interim = `${interim} ${transcript}`.trim();
          }
        }

        const combinedTranscript = `${refs.speechFinalTextRef.current} ${interim}`.trim();
        setInputValue(mergeSpeechText(refs.speechBaseTextRef.current, combinedTranscript));
      };

      recognition.onerror = (event) => {
        const code = event.error ?? "unknown";
        if (code === "aborted") return;
        if (code === "not-allowed" || code === "service-not-allowed") {
          toast.error("Microphone permission denied.");
          stopListening();
          return;
        }
        if (code === "no-speech") {
          refs.forceAdvanceLanguageRef.current =
            refs.autoDetectModeRef.current &&
            refs.languageIndexRef.current < refs.languageCandidatesRef.current.length - 1;
          return;
        }
        toast.error("Voice input failed. Please try again.");
      };

      recognition.onend = () => {
        clearLanguageRotateTimer();
        refs.recognitionRef.current = null;
        if (!refs.keepListeningRef.current) {
          setActiveRecognitionLanguage(null);
          return;
        }

        const hasNextLanguage =
          refs.autoDetectModeRef.current &&
          refs.languageIndexRef.current < refs.languageCandidatesRef.current.length - 1;
        const shouldAdvanceLanguage =
          hasNextLanguage &&
          (refs.forceAdvanceLanguageRef.current || !shouldKeepCurrentLanguage());
        const nextIndex = shouldAdvanceLanguage
          ? refs.languageIndexRef.current + 1
          : refs.languageIndexRef.current;

        refs.forceAdvanceLanguageRef.current = false;
        run(nextIndex);
      };

      if (refs.autoDetectModeRef.current) {
        refs.languageRotateTimerRef.current = window.setTimeout(() => {
          if (!refs.keepListeningRef.current) return;
          if (refs.recognitionRef.current !== recognition) return;
          if (refs.languageIndexRef.current >= refs.languageCandidatesRef.current.length - 1) {
            return;
          }
          if (shouldKeepCurrentLanguage()) return;
          refs.forceAdvanceLanguageRef.current = true;
          recognition.stop();
        }, LANGUAGE_ROTATE_INTERVAL_MS);
      }

      recognition.start();
    } catch {
      toast.error("Could not start voice recognition.");
      stopListening();
    }
  };

  run(startIndex);
}

export function initializeSpeechSession(
  refs: SpeechInputRunnerRefs,
  options: {
    inputValue: string;
    preferredSpeechLanguage: string;
    autoLanguageValue: string;
  },
): void {
  refs.keepListeningRef.current = true;
  refs.speechBaseTextRef.current = options.inputValue;
  refs.speechFinalTextRef.current = "";
  refs.hasFinalResultRef.current = false;
  refs.hasConfidenceScoreRef.current = false;
  refs.bestConfidenceRef.current = 0;
  refs.finalTranscriptCharsRef.current = 0;
  refs.forceAdvanceLanguageRef.current = false;
  refs.autoDetectModeRef.current =
    options.preferredSpeechLanguage === options.autoLanguageValue;
  refs.languageCandidatesRef.current = buildSpeechLanguageCandidates(
    options.preferredSpeechLanguage,
  );
  refs.languageIndexRef.current = 0;
}
