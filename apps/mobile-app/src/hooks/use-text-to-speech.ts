import { useCallback, useEffect, useState } from "react";
import { requireOptionalNativeModule } from "expo";

type SpeechApi = typeof import("expo-speech");

// expo-speech is new in this release, so builds made before it (and any build
// without it) lack the native "ExpoSpeech" module. Importing it statically
// would crash the whole app on launch there; load it only when it exists and
// hide Speak otherwise.
let speechApi: SpeechApi | null | undefined;
function getSpeech(): SpeechApi | null {
  if (speechApi !== undefined) return speechApi;
  if (!requireOptionalNativeModule("ExpoSpeech")) {
    speechApi = null;
    return speechApi;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    speechApi = require("expo-speech") as SpeechApi;
  } catch {
    speechApi = null;
  }
  return speechApi;
}

/** Whether read-aloud can work in this build. */
export function isSpeechAvailable(): boolean {
  return getSpeech() !== null;
}

// Only one message reads aloud at a time, so a second "Speak" stops the first.
let activeOwner: symbol | null = null;
const ownerListeners = new Set<() => void>();

function setActiveOwner(owner: symbol | null) {
  activeOwner = owner;
  for (const listener of ownerListeners) listener();
}

/** Markdown → speakable prose (mirrors web's use-text-to-speech cleanup). */
export function toSpeechText(content: string): string {
  if (!content) return "";
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[*_~>#|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Read an assistant message aloud with the platform voice (expo-speech), the
 * native equivalent of the web Speak action.
 */
export function useTextToSpeech(content: string) {
  const [owner] = useState(() => Symbol("speech"));
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechText = toSpeechText(content);

  useEffect(() => {
    const listener = () => {
      if (activeOwner !== owner) setIsSpeaking(false);
    };
    ownerListeners.add(listener);
    return () => {
      ownerListeners.delete(listener);
      if (activeOwner === owner) {
        setActiveOwner(null);
        void getSpeech()?.stop();
      }
    };
  }, [owner]);

  const handleSpeak = useCallback(() => {
    const Speech = getSpeech();
    if (!speechText || !Speech) return;
    if (activeOwner === owner) {
      void Speech.stop();
      setActiveOwner(null);
      setIsSpeaking(false);
      return;
    }
    void Speech.stop();
    setActiveOwner(owner);
    setIsSpeaking(true);
    const finish = () => {
      if (activeOwner === owner) setActiveOwner(null);
      setIsSpeaking(false);
    };
    Speech.speak(speechText, {
      onDone: finish,
      onStopped: finish,
      onError: finish,
    });
  }, [owner, speechText]);

  return { isSpeaking, speechText, handleSpeak };
}
