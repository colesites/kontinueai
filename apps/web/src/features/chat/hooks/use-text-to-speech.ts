import { useState, useRef, useEffect, useMemo, useCallback } from "react";

export function useTextToSpeech(content: string) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speechText = useMemo(() => {
    if (!content) return "";
    return content
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/#+\s/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }, [content]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      window.speechSynthesis.cancel();
    };
  }, []);

  const handleSpeak = useCallback(() => {
    if (typeof window === "undefined" || !speechText) return;
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechRef.current = utterance;
    setIsSpeaking(true);
    synth.speak(utterance);
  }, [speechText]);

  return { isSpeaking, speechText, handleSpeak };
}
