import { describe, expect, test, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { ShareModal } from "../components/ShareModal";

// Store original values to restore after tests
const originalOrigin = window.location.origin;
const originalClipboard = navigator.clipboard;
const originalShare = navigator.share;

describe("ShareModal - Unit Tests", () => {
  afterEach(() => {
    // Restore all global state after each test
    cleanup();
    
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        origin: originalOrigin
      },
      writable: true
    });
    
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true
    });
    
    if (originalShare) {
      Object.defineProperty(navigator, 'share', {
        value: originalShare,
        writable: true,
        configurable: true
      });
    } else {
      delete (navigator as any).share;
    }
  });
  test("modal displays when isOpen is true", () => {
    render(
      <ShareModal
        isOpen={true}
        onClose={() => {}}
        chatId="test-chat-123"
        chatTitle="Test Chat"
      />
    );

    // Modal should be visible
    expect(screen.getByText("Share Test Chat")).toBeDefined();
    expect(screen.getByTestId("share-link-input")).toBeDefined();
    expect(screen.getByTestId("copy-link-button")).toBeDefined();
  });

  test("modal hides when isOpen is false", () => {
    render(
      <ShareModal
        isOpen={false}
        onClose={() => {}}
        chatId="test-chat-123"
        chatTitle="Test Chat"
      />
    );

    // Modal should not be visible
    expect(screen.queryByText("Share Test Chat")).toBeNull();
    expect(screen.queryByTestId("share-link-input")).toBeNull();
    expect(screen.queryByTestId("copy-link-button")).toBeNull();
  });

  test("forbidden elements are not present (New Link, Edit, timestamp, views)", () => {
    render(
      <ShareModal
        isOpen={true}
        onClose={() => {}}
        chatId="test-chat-123"
        chatTitle="Test Chat"
      />
    );

    // Verify forbidden elements are NOT present
    expect(screen.queryByText(/new link/i)).toBeNull();
    expect(screen.queryByText(/edit/i)).toBeNull();
    expect(screen.queryByText(/timestamp/i)).toBeNull();
    expect(screen.queryByText(/views/i)).toBeNull();
    expect(screen.queryByText(/view count/i)).toBeNull();
  });

  test("social sharing options are present when Web Share API is available", () => {
    // Mock navigator.share to simulate availability
    const originalShare = navigator.share;
    (navigator as any).share = async () => {};

    render(
      <ShareModal
        isOpen={true}
        onClose={() => {}}
        chatId="test-chat-123"
        chatTitle="Test Chat"
      />
    );

    // Social share button should be present
    const socialShareButton = screen.queryByTestId("social-share-button");
    expect(socialShareButton).toBeDefined();

    // Restore original navigator.share
    if (originalShare) {
      (navigator as any).share = originalShare;
    } else {
      delete (navigator as any).share;
    }
  });

  test("social sharing options are hidden when Web Share API is unavailable", () => {
    // Mock navigator.share to simulate unavailability
    const originalShare = navigator.share;
    delete (navigator as any).share;

    render(
      <ShareModal
        isOpen={true}
        onClose={() => {}}
        chatId="test-chat-123"
        chatTitle="Test Chat"
      />
    );

    // Social share button should NOT be present
    const socialShareButton = screen.queryByTestId("social-share-button");
    expect(socialShareButton).toBeNull();

    // Restore original navigator.share
    if (originalShare) {
      (navigator as any).share = originalShare;
    }
  });

  test("clipboard error handling - fallback when clipboard API unavailable", async () => {
    // Mock window.location.origin
    const originalOrigin = window.location.origin;
    const originalClipboard = navigator.clipboard;
    
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        origin: 'http://localhost:3000'
      },
      writable: true
    });

    // Remove clipboard API to simulate unavailability
    delete (navigator as any).clipboard;

    try {
      render(
        <ShareModal
          isOpen={true}
          onClose={() => {}}
          chatId="test-chat-123"
          chatTitle="Test Chat"
        />
      );

      const copyButton = screen.getByTestId("copy-link-button");
      
      // Click should not throw error even without clipboard API
      copyButton.click();
      
      // Button should still be present and functional
      expect(copyButton).toBeDefined();
    } finally {
      // Restore original values
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          origin: originalOrigin
        },
        writable: true
      });
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', {
          value: originalClipboard,
          writable: true,
          configurable: true
        });
      }
    }
  });

  test("clipboard error handling - error during writeText", async () => {
    // Mock window.location.origin
    const originalOrigin = window.location.origin;
    const originalClipboard = navigator.clipboard;
    const originalConsoleError = console.error;
    
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        origin: 'http://localhost:3000'
      },
      writable: true
    });

    // Mock clipboard to throw error
    let errorLogged = false;
    console.error = (...args: any[]) => {
      if (args[0] === 'Failed to copy:') {
        errorLogged = true;
      }
    };

    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('Clipboard write failed');
        }
      },
      writable: true,
      configurable: true
    });

    try {
      render(
        <ShareModal
          isOpen={true}
          onClose={() => {}}
          chatId="test-chat-123"
          chatTitle="Test Chat"
        />
      );

      const copyButton = screen.getByTestId("copy-link-button");
      
      // Click the button
      copyButton.click();
      
      // Wait a bit for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Error should be logged
      expect(errorLogged).toBe(true);
      
      // Button should not show success state
      expect(copyButton.textContent).toContain('Copy Link');
    } finally {
      // Restore original values
      console.error = originalConsoleError;
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          origin: originalOrigin
        },
        writable: true
      });
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true
      });
    }
  });

  test("share API called with correct parameters", async () => {
    // Mock window.location.origin
    const originalOrigin = window.location.origin;
    const originalShare = navigator.share;
    
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        origin: 'http://localhost:3000'
      },
      writable: true
    });

    try {
      // Mock navigator.share to capture parameters
      let capturedData: { title?: string; url?: string } | null = null;
      Object.defineProperty(navigator, 'share', {
        value: async (data: { title?: string; url?: string }) => {
          capturedData = data;
          return Promise.resolve();
        },
        writable: true,
        configurable: true
      });
      
      // Type assertion to help TypeScript understand the type after the check
      type ShareData = { title?: string; url?: string };

      render(
        <ShareModal
          isOpen={true}
          onClose={() => {}}
          chatId="test-chat-123"
          chatTitle="Test Chat"
        />
      );

      const socialShareButton = screen.getByTestId("social-share-button");
      
      // Click the social share button
      socialShareButton.click();
      
      // Wait a bit for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify share API was called with correct parameters
      expect(capturedData).not.toBeNull();
      expect(capturedData!.url).toBe('http://localhost:3000/share/test-chat-123');
      expect(capturedData!.title).toBe('Test Chat');
    } finally {
      // Restore original values
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          origin: originalOrigin
        },
        writable: true
      });
      if (originalShare) {
        Object.defineProperty(navigator, 'share', {
          value: originalShare,
          writable: true,
          configurable: true
        });
      } else {
        delete (navigator as any).share;
      }
    }
  });
});
