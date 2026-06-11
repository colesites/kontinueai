import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

type SpeechModule = typeof import("expo-speech-recognition");

// Lazy-load so the app still runs in Expo Go (the native module only exists
// in development/production builds). The hook degrades to an explanatory
// alert when the module is unavailable.
let speechModule: SpeechModule | null | undefined;
function getSpeechModule(): SpeechModule | null {
  if (speechModule !== undefined) return speechModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    speechModule = require("expo-speech-recognition") as SpeechModule;
  } catch {
    speechModule = null;
  }
  return speechModule;
}

/**
 * Voice input via the platform speech recognizer. `onTranscript` receives the
 * live transcript (interim while speaking, final on end).
 */
export function useVoiceInput(onTranscript: (text: string, isFinal: boolean) => void) {
  const [isListening, setIsListening] = useState(false);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const speech = getSpeechModule();
    if (!speech) return;

    const resultSub = speech.ExpoSpeechRecognitionModule.addListener(
      "result",
      (event: { results: { transcript: string }[]; isFinal: boolean }) => {
        const transcript = event.results[0]?.transcript ?? "";
        if (transcript) onTranscriptRef.current(transcript, event.isFinal);
      },
    );
    const endSub = speech.ExpoSpeechRecognitionModule.addListener("end", () => {
      setIsListening(false);
    });
    const errorSub = speech.ExpoSpeechRecognitionModule.addListener(
      "error",
      (event: { error: string; message: string }) => {
        setIsListening(false);
        if (event.error !== "no-speech" && event.error !== "aborted") {
          Alert.alert("Voice input failed", event.message || event.error);
        }
      },
    );
    return () => {
      resultSub.remove();
      endSub.remove();
      errorSub.remove();
    };
  }, []);

  const start = useCallback(async () => {
    const speech = getSpeechModule();
    if (!speech) {
      Alert.alert(
        "Voice input unavailable",
        "Speech recognition needs a development or production build of the app — it isn't available in Expo Go.",
      );
      return;
    }
    const permission =
      await speech.ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microphone needed", "Allow microphone access to use voice input.");
      return;
    }
    setIsListening(true);
    speech.ExpoSpeechRecognitionModule.start({
      interimResults: true,
      continuous: false,
    });
  }, []);

  const stop = useCallback(() => {
    const speech = getSpeechModule();
    speech?.ExpoSpeechRecognitionModule.stop();
    setIsListening(false);
  }, []);

  return { isListening, start, stop, toggle: isListening ? stop : start };
}
