import * as SecureStore from "expo-secure-store";
import {
  normalizeSpeechLanguage,
  SPEECH_AUTO_LANGUAGE,
  SPEECH_LANGUAGE_STORAGE_KEY,
} from "@repo/core/speech-settings";

export async function getMobileSpeechLanguage(): Promise<string> {
  try {
    return normalizeSpeechLanguage(
      await SecureStore.getItemAsync(SPEECH_LANGUAGE_STORAGE_KEY),
    );
  } catch {
    return SPEECH_AUTO_LANGUAGE;
  }
}

export async function setMobileSpeechLanguage(value: string): Promise<string> {
  const normalized = normalizeSpeechLanguage(value);
  await SecureStore.setItemAsync(SPEECH_LANGUAGE_STORAGE_KEY, normalized);
  return normalized;
}
