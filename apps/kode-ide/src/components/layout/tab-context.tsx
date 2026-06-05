import { createContext, useContext } from "react";

export type AppTab = "plan" | "design" | "code" | "review";

type TabContextValue = {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
};

const TabContext = createContext<TabContextValue | null>(null);

export const TabProvider = TabContext.Provider;

export function useAppTab(): TabContextValue {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error("useAppTab must be used within a TabProvider");
  return ctx;
}
