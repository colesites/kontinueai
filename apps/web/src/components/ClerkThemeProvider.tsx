"use client";

import { useEffect, useState } from "react";
import { getSavedTheme, type Theme } from "../lib/theme";

// Theme-specific Clerk colors
const CLERK_THEME_COLORS = {
  default: {
    light: {
      primary: "#e91e63",
      background: "#ffffff",
      inputBackground: "#f5f5f5",
      inputText: "#1a1a1a",
      text: "#1a1a1a",
      textSecondary: "#666666",
      border: "#e0e0e0",
    },
    dark: {
      primary: "#ec4899",
      background: "#1a1a1c",
      inputBackground: "#27272a",
      inputText: "#fafafa",
      text: "#fafafa",
      textSecondary: "#a1a1aa",
      border: "#3f3f46",
    },
  },
  emerald: {
    light: {
      primary: "#10b981",
      background: "#ffffff",
      inputBackground: "#f0fdf4",
      inputText: "#1a1a1a",
      text: "#1a1a1a",
      textSecondary: "#666666",
      border: "#d1fae5",
    },
    dark: {
      primary: "#34d399",
      background: "#1a1f1e",
      inputBackground: "#27322f",
      inputText: "#fafafa",
      text: "#fafafa",
      textSecondary: "#a1a1aa",
      border: "#3f4f4a",
    },
  },
  chelsea: {
    light: {
      primary: "#1f4ea8",
      background: "#f5f8ff",
      inputBackground: "#ebf1ff",
      inputText: "#1a1a1a",
      text: "#1a1a1a",
      textSecondary: "#5a647a",
      border: "#d2def8",
    },
    dark: {
      primary: "#3d6de0",
      background: "#1f2430",
      inputBackground: "#2a3242",
      inputText: "#fafafa",
      text: "#fafafa",
      textSecondary: "#a7b0c4",
      border: "#4a5a77",
    },
  },
  amethyst: {
    light: {
      primary: "#b635b1",
      background: "#ffffff",
      inputBackground: "#f7f0f8",
      inputText: "#1f1a21",
      text: "#1f1a21",
      textSecondary: "#6f6573",
      border: "#e4d5e7",
    },
    dark: {
      primary: "#cc54c7",
      background: "#201824",
      inputBackground: "#2a2230",
      inputText: "#fafafa",
      text: "#fafafa",
      textSecondary: "#b2a7b8",
      border: "#4d4055",
    },
  },
  normal: {
    light: {
      primary: "#000000",
      background: "#ffffff",
      inputBackground: "#ffffff",
      inputText: "#000000",
      text: "#000000",
      textSecondary: "#000000",
      border: "#000000",
    },
    dark: {
      primary: "#ffffff",
      background: "#000000",
      inputBackground: "#000000",
      inputText: "#ffffff",
      text: "#ffffff",
      textSecondary: "#ffffff",
      border: "#ffffff",
    },
  },
} as const;

export function useClerkTheme() {
  const [theme, setTheme] = useState<Theme>(() => getSavedTheme() ?? "default");
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false
  );

  useEffect(() => {
    // Check if dark mode is active
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    // Check for theme class changes
    const checkTheme = () => {
      const savedTheme = getSavedTheme();
      if (savedTheme) {
        setTheme(savedTheme);
      }
    };

    // Watch for class changes (dark mode and theme changes)
    const observer = new MutationObserver(() => {
      checkDarkMode();
      checkTheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Also listen for storage events (theme changes in other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "ui-theme") {
        checkTheme();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const colors = CLERK_THEME_COLORS[theme][isDark ? "dark" : "light"];

  return {
    variables: {
      colorPrimary: colors.primary,
      colorBackground: colors.background,
      colorInputBackground: colors.inputBackground,
      colorInputText: colors.inputText,
      colorText: colors.text,
      colorTextSecondary: colors.textSecondary,
      borderRadius: "0.5rem",
    },
    elements: {
      formButtonPrimary: `bg-[${colors.primary}] hover:opacity-90 text-white font-medium`,
      card: `bg-[${colors.background}] border border-[${colors.border}]`,
      headerTitle: `text-[${colors.text}]`,
      headerSubtitle: `text-[${colors.textSecondary}]`,
      socialButtonsBlockButton: `bg-[${colors.inputBackground}] border-[${colors.border}] text-[${colors.text}] hover:opacity-90`,
      formFieldLabel: `text-[${colors.text}]`,
      formFieldInput: `bg-[${colors.inputBackground}] border-[${colors.border}] text-[${colors.inputText}]`,
      footerActionLink: `text-[${colors.primary}] hover:opacity-80`,
      dividerLine: `bg-[${colors.border}]`,
      dividerText: `text-[${colors.textSecondary}]`,
      formFieldInputShowPasswordButton: `text-[${colors.textSecondary}] hover:text-[${colors.text}]`,
      identityPreviewText: `text-[${colors.text}]`,
      identityPreviewEditButton: `text-[${colors.primary}] hover:opacity-80`,
    },
  };
}
