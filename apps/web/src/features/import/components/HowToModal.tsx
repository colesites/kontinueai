"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, Info, Link2 } from "lucide-react";
import { HowToStep } from "./HowToStep";

const STORAGE_KEY = "continue-ai-how-to-seen";

export function HowToModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      // Avoid setState synchronously inside the effect body (repo lint rule).
      const t = setTimeout(() => setIsOpen(true), 0);
      return () => clearTimeout(t);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header gradient */}
        <div className="h-1 bg-linear-to-r from-primary via-accent to-secondary" />

        <div className="p-6">
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>

          {/* Title */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-linear-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="text-primary-foreground" size={28} />
            </div>
            <h2 className="text-2xl font-bold text-foreground">
              Welcome to Kontinue AI
            </h2>
            <p className="text-muted-foreground mt-2">
              Pick up where you left off with any AI conversation
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4 mb-6">
            <HowToStep
              icon={<Sparkles size={18} />}
              title="Continue with any model"
              description="Pick GPT / Claude / Gemini (via AI Gateway) and keep going."
            />

            <HowToStep
              icon={<Link2 size={18} />}
              title="Paste a shared link"
              description="We'll automatically scrape the conversation from ChatGPT, Claude, or Gemini."
            />
          </div>

          {/* Tip */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30 mb-6">
            <Info size={18} className="text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-foreground font-medium">Pro tip</p>
              <div className="mt-1 space-y-1 text-muted-foreground">
                <p>
                  You can import shared links from multiple providers. Just
                  paste the URL and we handle the rest!
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={handleClose}
            className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
