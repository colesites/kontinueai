import { useEffect, useState } from "react";
import {
  getSavedSpeechLanguage,
  SPEECH_LANGUAGE_CHANGED_EVENT,
  SPEECH_LANGUAGE_STORAGE_KEY,
} from "@repo/core/speech-settings";

export function useSpeechPreference(): string {
  const [preferredSpeechLanguage, setPreferredSpeechLanguage] = useState(() =>
    getSavedSpeechLanguage(),
  );

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === SPEECH_LANGUAGE_STORAGE_KEY) {
        setPreferredSpeechLanguage(getSavedSpeechLanguage());
      }
    };

    const handleLanguageChange = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      setPreferredSpeechLanguage(
        customEvent.detail || getSavedSpeechLanguage(),
      );
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(
      SPEECH_LANGUAGE_CHANGED_EVENT,
      handleLanguageChange as EventListener,
    );

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        SPEECH_LANGUAGE_CHANGED_EVENT,
        handleLanguageChange as EventListener,
      );
    };
  }, []);

  return preferredSpeechLanguage;
}
