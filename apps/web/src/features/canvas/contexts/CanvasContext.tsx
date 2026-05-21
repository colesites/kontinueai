"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface CanvasContextValue {
  tab: "community" | "mine";
  setTab: (tab: "community" | "mine") => void;
}

const CanvasContext = createContext<CanvasContextValue | undefined>(undefined);

export function CanvasProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<"community" | "mine">("community");

  return (
    <CanvasContext.Provider value={{ tab, setTab }}>
      {children}
    </CanvasContext.Provider>
  );
}

export function useCanvasContext() {
  const context = useContext(CanvasContext);
  if (context === undefined) {
    throw new Error("useCanvasContext must be used within a CanvasProvider");
  }
  return context;
}
