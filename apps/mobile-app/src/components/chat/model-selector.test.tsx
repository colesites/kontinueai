import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { ModelSelector } from "./model-selector";

const onClose = jest.fn();
const onSelect = jest.fn();

let mockPaidPlan = false;
let mockProModelById: Record<string, boolean> = {};

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SafeAreaView: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <View {...props}>{children}</View>
    ),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    isDark: true,
    primary: "#ec4899",
  }),
}));

jest.mock("@/components/ui/text", () => {
  const { Text } = require("react-native");
  return { Text };
});

jest.mock("@/components/ui/icon", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Icon: ({ as: _Icon, ...props }: Record<string, unknown>) =>
      React.createElement(Text, props, "icon"),
  };
});

jest.mock("@/hooks/use-plan-tier", () => ({
  useIsProPlan: () => mockPaidPlan,
}));

jest.mock("@repo/core/use-model-capabilities", () => ({
  useModelCapabilities: () => ({
    getCapabilities: (modelId: string) =>
      modelId === "kontinue/k-ai-1.0"
        ? ["text", "thinking", "web-search"]
        : ["text"],
    isProModel: (modelId: string) => modelId !== "kontinue/k-ai-1.0",
    proModelById: mockProModelById,
  }),
}));

jest.mock("@repo/ai/lib/models", () => ({
  AVAILABLE_MODELS: [
    {
      id: "kontinue/k-ai-1.0",
      name: "K-AI 1.0",
      provider: "kontinue",
      description: "Kontinue default model.",
      isDefault: true,
    },
    {
      id: "openai/gpt-5.5-pro",
      name: "GPT-5.5 Pro",
      provider: "openai",
      description: "Premium OpenAI model.",
    },
    {
      id: "anthropic/claude-opus-4.5",
      name: "Claude Opus 4.5",
      provider: "anthropic",
      description: "Premium Anthropic model.",
    },
  ],
}));

function renderSelector() {
  return render(
    <ModelSelector
      visible
      selectedModel="kontinue/k-ai-1.0"
      onClose={onClose}
      onSelect={onSelect}
    />,
  );
}

describe("ModelSelector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPaidPlan = false;
    mockProModelById = {};
  });

  it("renders the web-style modal selector content", () => {
    renderSelector();

    expect(screen.getByTestId("model-selector-dialog")).toBeTruthy();
    expect(screen.getByLabelText("All models")).toBeTruthy();
    expect(screen.getByLabelText("Search models")).toBeTruthy();
    expect(screen.getByText("K-AI 1.0")).toBeTruthy();
    expect(screen.getByText("GPT-5.5 Pro")).toBeTruthy();
  });

  it("filters models by search and can clear the query", () => {
    renderSelector();

    fireEvent.change(screen.getByLabelText("Search models"), {
      target: { value: "opus" },
    });

    expect(screen.queryByText("K-AI 1.0")).toBeNull();
    expect(screen.getByText("Claude Opus 4.5")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Clear search"));

    expect(screen.getByText("K-AI 1.0")).toBeTruthy();
  });

  it("selects an unknown premium model while gateway metadata is still loading", () => {
    renderSelector();

    fireEvent.click(screen.getByLabelText("Select GPT-5.5 Pro"));

    expect(onSelect).toHaveBeenCalledWith("openai/gpt-5.5-pro");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not select a known premium model for a free user", () => {
    mockProModelById = { "openai/gpt-5.5-pro": true };

    renderSelector();
    fireEvent.click(screen.getByLabelText("Select GPT-5.5 Pro"));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
