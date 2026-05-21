"use client";

import { useEffect, useRef, useState } from "react";

type UseDoubleTapActivationArgs = {
  windowMs?: number;
  hintTimeoutMs?: number;
};

type UseDoubleTapActivationResult = {
  isArmed: boolean;
  registerTap: (callbacks?: {
    onSingleTap?: () => void;
    onDoubleTap?: () => void;
  }) => boolean;
};

export function useDoubleTapActivation({
  windowMs = 320,
  hintTimeoutMs = 800,
}: UseDoubleTapActivationArgs = {}): UseDoubleTapActivationResult {
  const [isArmed, setIsArmed] = useState(false);
  const lastTapAtRef = useRef(0);
  const hintTimerRef = useRef<number | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) {
        window.clearTimeout(hintTimerRef.current);
      }
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
      }
    };
  }, []);

  const armDoubleTap = () => {
    setIsArmed(true);
    if (hintTimerRef.current) {
      window.clearTimeout(hintTimerRef.current);
    }
    hintTimerRef.current = window.setTimeout(() => {
      setIsArmed(false);
      hintTimerRef.current = null;
    }, hintTimeoutMs);
  };

  const clearSingleTapTimer = () => {
    if (!singleTapTimerRef.current) return;
    window.clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = null;
  };

  const registerTap = (callbacks?: {
    onSingleTap?: () => void;
    onDoubleTap?: () => void;
  }) => {
    const now = Date.now();
    const elapsed = now - lastTapAtRef.current;
    lastTapAtRef.current = now;

    const isDoubleTap = elapsed > 0 && elapsed <= windowMs;
    if (isDoubleTap) {
      clearSingleTapTimer();
      if (hintTimerRef.current) {
        window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
      setIsArmed(false);
      callbacks?.onDoubleTap?.();
      return true;
    }

    armDoubleTap();
    clearSingleTapTimer();
    if (callbacks?.onSingleTap) {
      singleTapTimerRef.current = window.setTimeout(() => {
        callbacks.onSingleTap?.();
        singleTapTimerRef.current = null;
      }, windowMs);
    }
    return false;
  };

  return { isArmed, registerTap };
}
