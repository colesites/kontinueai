export const SPEECH_LANGUAGE_STORAGE_KEY = "speech-input-language";
export const SPEECH_LANGUAGE_CHANGED_EVENT = "speech-language-changed";
export const SPEECH_AUTO_LANGUAGE = "auto";

export interface SpeechLanguageOption {
  value: string;
  label: string;
  nativeLabel?: string;
}

export const SPEECH_LANGUAGE_OPTIONS: SpeechLanguageOption[] = [
  { value: SPEECH_AUTO_LANGUAGE, label: "Auto detect (Recommended)" },
  { value: "en-US", label: "English (United States)", nativeLabel: "English" },
  { value: "en-GB", label: "English (United Kingdom)", nativeLabel: "English" },
  { value: "en-AU", label: "English (Australia)", nativeLabel: "English" },
  { value: "en-CA", label: "English (Canada)", nativeLabel: "English" },
  { value: "en-IN", label: "English (India)", nativeLabel: "English" },
  { value: "en-NG", label: "English (Nigeria)", nativeLabel: "English" },
  { value: "yo-NG", label: "Yoruba (Nigeria)", nativeLabel: "Yoruba" },
  { value: "ig-NG", label: "Igbo (Nigeria)", nativeLabel: "Igbo" },
  { value: "ha-NG", label: "Hausa (Nigeria)", nativeLabel: "Hausa" },
  { value: "sw-KE", label: "Swahili (Kenya)", nativeLabel: "Kiswahili" },
  { value: "af-ZA", label: "Afrikaans (South Africa)", nativeLabel: "Afrikaans" },
  { value: "zu-ZA", label: "Zulu (South Africa)", nativeLabel: "isiZulu" },
  { value: "xh-ZA", label: "Xhosa (South Africa)", nativeLabel: "isiXhosa" },
  { value: "am-ET", label: "Amharic (Ethiopia)", nativeLabel: "Amharic" },
  { value: "so-SO", label: "Somali (Somalia)", nativeLabel: "Somali" },
  { value: "fr-FR", label: "French (France)", nativeLabel: "Francais" },
  { value: "fr-CA", label: "French (Canada)", nativeLabel: "Francais" },
  { value: "es-ES", label: "Spanish (Spain)", nativeLabel: "Espanol" },
  { value: "es-MX", label: "Spanish (Mexico)", nativeLabel: "Espanol" },
  { value: "es-US", label: "Spanish (United States)", nativeLabel: "Espanol" },
  { value: "pt-BR", label: "Portuguese (Brazil)", nativeLabel: "Portugues" },
  { value: "pt-PT", label: "Portuguese (Portugal)", nativeLabel: "Portugues" },
  { value: "de-DE", label: "German (Germany)", nativeLabel: "Deutsch" },
  { value: "it-IT", label: "Italian (Italy)", nativeLabel: "Italiano" },
  { value: "nl-NL", label: "Dutch (Netherlands)", nativeLabel: "Nederlands" },
  { value: "pl-PL", label: "Polish (Poland)", nativeLabel: "Polski" },
  { value: "tr-TR", label: "Turkish (Turkey)", nativeLabel: "Turkce" },
  { value: "ru-RU", label: "Russian (Russia)", nativeLabel: "Russkiy" },
  { value: "uk-UA", label: "Ukrainian (Ukraine)", nativeLabel: "Ukrainska" },
  { value: "cs-CZ", label: "Czech (Czechia)", nativeLabel: "Cestina" },
  { value: "sk-SK", label: "Slovak (Slovakia)", nativeLabel: "Slovencina" },
  { value: "ro-RO", label: "Romanian (Romania)", nativeLabel: "Romana" },
  { value: "hu-HU", label: "Hungarian (Hungary)", nativeLabel: "Magyar" },
  { value: "bg-BG", label: "Bulgarian (Bulgaria)", nativeLabel: "Balgarski" },
  { value: "hr-HR", label: "Croatian (Croatia)", nativeLabel: "Hrvatski" },
  { value: "sr-RS", label: "Serbian (Serbia)", nativeLabel: "Srpski" },
  { value: "sl-SI", label: "Slovenian (Slovenia)", nativeLabel: "Slovenscina" },
  { value: "lt-LT", label: "Lithuanian (Lithuania)", nativeLabel: "Lietuviu" },
  { value: "lv-LV", label: "Latvian (Latvia)", nativeLabel: "Latviesu" },
  { value: "et-EE", label: "Estonian (Estonia)", nativeLabel: "Eesti" },
  { value: "fi-FI", label: "Finnish (Finland)", nativeLabel: "Suomi" },
  { value: "sv-SE", label: "Swedish (Sweden)", nativeLabel: "Svenska" },
  { value: "nb-NO", label: "Norwegian (Norway)", nativeLabel: "Norsk" },
  { value: "da-DK", label: "Danish (Denmark)", nativeLabel: "Dansk" },
  { value: "is-IS", label: "Icelandic (Iceland)", nativeLabel: "Islenska" },
  { value: "el-GR", label: "Greek (Greece)", nativeLabel: "Ellinika" },
  { value: "ar-SA", label: "Arabic (Saudi Arabia)", nativeLabel: "al arabiyya" },
  { value: "ar-EG", label: "Arabic (Egypt)", nativeLabel: "al arabiyya" },
  { value: "ar-MA", label: "Arabic (Morocco)", nativeLabel: "al arabiyya" },
  { value: "he-IL", label: "Hebrew (Israel)", nativeLabel: "Ivrit" },
  { value: "fa-IR", label: "Persian (Iran)", nativeLabel: "Farsi" },
  { value: "hi-IN", label: "Hindi (India)", nativeLabel: "Hindi" },
  { value: "bn-BD", label: "Bengali (Bangladesh)", nativeLabel: "Bangla" },
  { value: "ur-PK", label: "Urdu (Pakistan)", nativeLabel: "Urdu" },
  { value: "pa-IN", label: "Punjabi (India)", nativeLabel: "Punjabi" },
  { value: "ta-IN", label: "Tamil (India)", nativeLabel: "Tamil" },
  { value: "te-IN", label: "Telugu (India)", nativeLabel: "Telugu" },
  { value: "mr-IN", label: "Marathi (India)", nativeLabel: "Marathi" },
  { value: "gu-IN", label: "Gujarati (India)", nativeLabel: "Gujarati" },
  { value: "kn-IN", label: "Kannada (India)", nativeLabel: "Kannada" },
  { value: "ml-IN", label: "Malayalam (India)", nativeLabel: "Malayalam" },
  { value: "ne-NP", label: "Nepali (Nepal)", nativeLabel: "Nepali" },
  { value: "zh-CN", label: "Chinese (Simplified)", nativeLabel: "Jian ti zhong wen" },
  { value: "zh-HK", label: "Chinese (Hong Kong)", nativeLabel: "Fan ti zhong wen" },
  { value: "zh-TW", label: "Chinese (Traditional)", nativeLabel: "Fan ti zhong wen" },
  { value: "ja-JP", label: "Japanese (Japan)", nativeLabel: "Nihongo" },
  { value: "ko-KR", label: "Korean (Korea)", nativeLabel: "Hangugeo" },
  { value: "th-TH", label: "Thai (Thailand)", nativeLabel: "Thai" },
  { value: "vi-VN", label: "Vietnamese (Vietnam)", nativeLabel: "Tieng Viet" },
  { value: "id-ID", label: "Indonesian (Indonesia)", nativeLabel: "Bahasa Indonesia" },
  { value: "ms-MY", label: "Malay (Malaysia)", nativeLabel: "Bahasa Melayu" },
  { value: "fil-PH", label: "Filipino (Philippines)", nativeLabel: "Filipino" },
  { value: "ca-ES", label: "Catalan (Spain)", nativeLabel: "Catala" },
  { value: "eu-ES", label: "Basque (Spain)", nativeLabel: "Euskara" },
  { value: "gl-ES", label: "Galician (Spain)", nativeLabel: "Galego" },
  { value: "cy-GB", label: "Welsh (United Kingdom)", nativeLabel: "Cymraeg" },
  { value: "ga-IE", label: "Irish (Ireland)", nativeLabel: "Gaeilge" },
  { value: "mt-MT", label: "Maltese (Malta)", nativeLabel: "Malti" },
];

const VALID_VALUES = new Set(SPEECH_LANGUAGE_OPTIONS.map((option) => option.value));

export function normalizeSpeechLanguage(value: string | null | undefined): string {
  if (!value) return SPEECH_AUTO_LANGUAGE;
  return VALID_VALUES.has(value) ? value : SPEECH_AUTO_LANGUAGE;
}

export function getSavedSpeechLanguage(): string {
  if (typeof window === "undefined") return SPEECH_AUTO_LANGUAGE;
  return normalizeSpeechLanguage(localStorage.getItem(SPEECH_LANGUAGE_STORAGE_KEY));
}

export function setSavedSpeechLanguage(value: string): string {
  const normalized = normalizeSpeechLanguage(value);
  if (typeof window === "undefined") return normalized;
  localStorage.setItem(SPEECH_LANGUAGE_STORAGE_KEY, normalized);
  window.dispatchEvent(
    new CustomEvent<string>(SPEECH_LANGUAGE_CHANGED_EVENT, { detail: normalized }),
  );
  return normalized;
}
