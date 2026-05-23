import { CanvasInputBar } from "../features/canvas/components/CanvasInputBar";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { expect, test, describe, vi, beforeEach, afterEach } from "bun:test";

vi.mock("@repo/ai/lib/canvas-models", () => ({
  IMAGE_MODELS: [{ id: "img-1", name: "Image 1" }],
  VIDEO_MODELS: [{ id: "vid-1", name: "Video 1" }],
  ASPECT_RATIOS: [{ value: "1:1", label: "1:1" }],
  VIDEO_DURATIONS: [2, 5, 10],
  DEFAULT_IMAGE_MODEL: "img-1",
  DEFAULT_VIDEO_MODEL: "vid-1",
  isRatioSupported: () => true,
  isDurationSupported: () => true,
}));

vi.mock("@repo/ui/components/ui/sidebar", () => ({
  useSidebar: () => ({
    state: "expanded",
    isMobile: false,
  }),
}));

vi.mock("../features/canvas/components/CanvasInputPrompt", () => ({
  CanvasInputPrompt: () => <div data-testid="canvas-input-prompt" />,
}));

vi.mock("../features/canvas/components/CanvasInputControls", () => ({
  CanvasInputControls: ({
    mode,
    setMode,
    duration,
  }: {
    mode: "image" | "video";
    setMode: (mode: "image" | "video") => void;
    duration: number;
  }) => (
    <div>
      <div data-testid="mode">{mode}</div>
      <div data-testid="duration">{duration}s</div>
      <button type="button" onClick={() => setMode("video")}>
        Switch To Video
      </button>
    </div>
  ),
}));

const mockProps = {
  onGenerate: vi.fn(),
  isGenerating: false,
  credits: { remaining: 1000, total: 1000 },
  canGenerateImages: true,
  canGenerateVideos: true,
  isPro: true,
};

describe("CanvasInputBar", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  test("automatically adjusts duration when credits decrease", () => {
    const initialCredits = { remaining: 120, total: 1000 };
    const { rerender } = render(
      <CanvasInputBar {...mockProps} credits={initialCredits} />,
    );

    fireEvent.click(screen.getByText("Switch To Video"));

    expect(screen.getByTestId("mode").textContent).toBe("video");
    expect(screen.getByTestId("duration").textContent).toContain("5s");

    rerender(
      <CanvasInputBar
        {...mockProps}
        credits={{ remaining: 50, total: 1000 }}
      />,
    );

    expect(screen.getByTestId("duration").textContent).toContain("2s");
  });

  test("switches to video mode while preserving a valid duration state", () => {
    render(
      <CanvasInputBar
        {...mockProps}
        credits={{ remaining: 50, total: 1000 }}
      />,
    );

    fireEvent.click(screen.getByText("Switch To Video"));

    expect(screen.getByTestId("mode").textContent).toBe("video");
    expect(screen.getByTestId("duration").textContent).toContain("5s");
  });
});
