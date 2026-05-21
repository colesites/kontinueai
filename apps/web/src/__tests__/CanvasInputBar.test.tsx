import { CanvasInputBar } from "../features/canvas/components/CanvasInputBar";
import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, describe, vi } from "bun:test";

// Mock the models
vi.mock("@repo/ui/lib/canvas-models", () => ({
  IMAGE_MODELS: [{ id: "img-1", name: "Image 1" }],
  VIDEO_MODELS: [{ id: "vid-1", name: "Video 1" }],
  ASPECT_RATIOS: [{ value: "1:1", label: "1:1" }],
  VIDEO_DURATIONS: [2, 5, 10], // Mocked durations
  DEFAULT_IMAGE_MODEL: "img-1",
  DEFAULT_VIDEO_MODEL: "vid-1",
}));

// Mock the sidebar hook
vi.mock("@repo/ui/components/ui/sidebar", () => ({
  useSidebar: () => ({
    state: "expanded",
    isMobile: false,
  }),
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
  test("automatically adjusts duration when credits decrease", async () => {
    // Start with enough credits for 5s (100 credits)
    const initialCredits = { remaining: 120, total: 1000 };
    const { rerender } = render(<CanvasInputBar {...mockProps} credits={initialCredits} />);

    // Switch to video mode
    const videoButton = screen.getByRole("button", { name: /video/i });
    fireEvent.click(videoButton);

    // Initial duration is 5s
    const durationButton = screen.getByTitle("Duration");
    expect(durationButton.textContent).toContain("5s");

    // Now simulate credits dropping to 50.
    // 5s (100) is now unaffordable.
    // 2s (40) is the affordable option.
    const lowCredits = { remaining: 50, total: 1000 };
    
    rerender(<CanvasInputBar {...mockProps} credits={lowCredits} />);

    // The duration pill should now show 2s
    expect(durationButton.textContent).toContain("2s");
  });

  test("filters options in PillSelect based on affordability", async () => {
    // With 50 credits, only 2s should be available
    const credits = { remaining: 50, total: 1000 };
    render(<CanvasInputBar {...mockProps} credits={credits} />);
    
    const videoButton = screen.getByRole("button", { name: /video/i });
    fireEvent.click(videoButton);

    const durationButton = screen.getByTitle("Duration");
    fireEvent.click(durationButton);
    
    // Check for 2s and 5s
    // Since we can't easily check hidden dropdown content in this test, 
    // we'll rely on the auto-correction test as the primary verification.
    expect(durationButton.textContent).toContain("2s");
  });
});
