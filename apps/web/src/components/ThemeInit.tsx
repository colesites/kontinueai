"use client";

import { useEffect } from "react";
import { getSavedTheme, setColorTheme } from "../lib/theme";

export function ThemeInit() {
  useEffect(() => {
    const savedTheme = getSavedTheme();
    if (savedTheme) {
      setColorTheme(savedTheme);
    }
  }, []);

  return null;
}
