import { describe, expect, test, afterEach } from "bun:test";
import { render, cleanup, waitFor } from "@testing-library/react";
import * as fc from "fast-check";
import { ShareModal } from "../components/ShareModal";

// Store original values to restore after tests
const originalOrigin = window.location.origin;
const originalClipboard = navigator.clipboard;
const originalShare = navigator.share;

describe("ShareModal - Property-Based Tests", () => {
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
  test("Property 1: Share Link Format Consistency - Feature: chat-share-feature, Property 1: Share Link Format Consistency", async () => {
    // Mock window.location.origin for tests
    const originalOrigin = window.location.origin;
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        origin: 'http://localhost:3000'
      },
      writable: true
    });

    try {
      // Generate random chatIds that match Convex ID format (alphanumeric, 20-40 chars)
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z0-9]{20,40}$/),
          async (chatId) => {
            // Clean up before each render
            cleanup();
            
            render(
              <ShareModal
                isOpen={true}
                onClose={() => {}}
                chatId={chatId}
                chatTitle="Test Chat"
              />
            );

            // Wait for the input to appear since Dialog renders asynchronously
            const input = await waitFor(() => {
              const el = document.querySelector('[data-testid="share-link-input"]') as HTMLInputElement;
              if (!el) throw new Error('Input not found');
              return el;
            });
            
            const shareUrl = input.value;

            // Verify the share link follows the format: ${origin}/share/${chatId}
            // Verify it contains /share/ path
            expect(shareUrl).toContain("/share/");
            
            // Verify it ends with the chatId
            expect(shareUrl.endsWith(chatId)).toBe(true);
            
            // Verify the full format
            expect(shareUrl).toMatch(new RegExp(`^https?://[^/]+/share/${chatId}$`));
          }
        ),
        { numRuns: 20 }
      );
    } finally {
      // Restore original origin
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          origin: originalOrigin
        },
        writable: true
      });
    }
  });

  test("Property 2: Modal Title Format - Feature: chat-share-feature, Property 2: Modal Title Format", () => {
    // Generate random chat titles (realistic alphanumeric with spaces)
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (chatTitle) => {
          // Clean up before each render
          cleanup();
          
          render(
            <ShareModal
              isOpen={true}
              onClose={() => {}}
              chatId="test-chat-id"
              chatTitle={chatTitle}
            />
          );

          // Verify the modal title follows the format "Share [Chat_Title]"
          // If chatTitle is empty or whitespace-only, it should display "Share Conversation"
          const trimmedTitle = chatTitle.trim();
          const expectedTitle = trimmedTitle ? `Share ${trimmedTitle}` : "Share Conversation";
          
          // Query from document since Dialog renders in a portal
          const titleElement = Array.from(document.querySelectorAll('h2')).find(
            el => el.textContent === expectedTitle
          );
          
          expect(titleElement).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  test("Property 3: Copy to Clipboard - Feature: chat-share-feature, Property 3: Copy to Clipboard", async () => {
    // Mock window.location.origin and clipboard API
    const originalOrigin = window.location.origin;
    const originalClipboard = navigator.clipboard;
    
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        origin: 'http://localhost:3000'
      },
      writable: true
    });

    try {
      // Generate random chatIds that match Convex ID format
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z0-9]{20,40}$/),
          async (chatId) => {
            // Clean up before each render
            cleanup();
            
            // Mock clipboard writeText
            let clipboardContent = '';
            Object.defineProperty(navigator, 'clipboard', {
              value: {
                writeText: async (text: string) => {
                  clipboardContent = text;
                  return Promise.resolve();
                }
              },
              writable: true,
              configurable: true
            });
            
            render(
              <ShareModal
                isOpen={true}
                onClose={() => {}}
                chatId={chatId}
                chatTitle="Test Chat"
              />
            );

            // Wait for the copy button to appear
            const copyButton = await waitFor(() => {
              const el = document.querySelector('[data-testid="copy-link-button"]');
              if (!el) throw new Error('Copy button not found');
              return el as HTMLElement;
            }, { timeout: 1000 });
            
            // Click the copy button directly
            copyButton.click();

            // Wait a bit for the async clipboard operation
            await waitFor(() => {
              if (clipboardContent === '') throw new Error('Clipboard not updated');
            }, { timeout: 1000 });

            // Verify clipboard contains the full URL
            const expectedUrl = `http://localhost:3000/share/${chatId}`;
            expect(clipboardContent).toBe(expectedUrl);
            
            // Verify it's a complete URL (includes domain and path)
            expect(clipboardContent).toMatch(/^https?:\/\//);
            expect(clipboardContent).toContain('/share/');
            expect(clipboardContent).toContain(chatId);
          }
        ),
        { numRuns: 20 }
      );
    } finally {
      // Restore original values
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

  test("Property 4: Copy Feedback Display - Feature: chat-share-feature, Property 4: Copy Feedback Display", async () => {
    // Mock window.location.origin and clipboard API
    const originalOrigin = window.location.origin;
    const originalClipboard = navigator.clipboard;
    
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        origin: 'http://localhost:3000'
      },
      writable: true
    });

    try {
      // Generate random chatIds that match Convex ID format
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z0-9]{20,40}$/),
          async (chatId) => {
            // Clean up before each render
            cleanup();
            
            // Mock clipboard writeText
            Object.defineProperty(navigator, 'clipboard', {
              value: {
                writeText: async (text: string) => Promise.resolve()
              },
              writable: true,
              configurable: true
            });
            
            render(
              <ShareModal
                isOpen={true}
                onClose={() => {}}
                chatId={chatId}
                chatTitle="Test Chat"
              />
            );

            // Wait for the copy button to appear
            const copyButton = await waitFor(() => {
              const el = document.querySelector('[data-testid="copy-link-button"]');
              if (!el) throw new Error('Copy button not found');
              return el as HTMLElement;
            }, { timeout: 1000 });
            
            // Verify initial state shows "Copy Link"
            expect(copyButton.textContent).toContain('Copy Link');
            
            // Click the copy button
            copyButton.click();

            // Wait for and verify visual feedback appears
            await waitFor(() => {
              const button = document.querySelector('[data-testid="copy-link-button"]') as HTMLElement;
              if (!button) throw new Error('Button not found');
              // Should show "Copied!" feedback
              if (!button.textContent?.includes('Copied')) {
                throw new Error('Feedback not shown');
              }
            }, { timeout: 1000 });

            // Verify the feedback is displayed
            const buttonAfterClick = document.querySelector('[data-testid="copy-link-button"]') as HTMLElement;
            expect(buttonAfterClick.textContent).toContain('Copied');
          }
        ),
        { numRuns: 20 }
      );
    } finally {
      // Restore original values
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

  test("Property 5: Share Link Idempotence - Feature: chat-share-feature, Property 5: Share Link Idempotence", async () => {
    // Mock window.location.origin
    const originalOrigin = window.location.origin;
    
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        origin: 'http://localhost:3000'
      },
      writable: true
    });

    try {
      // Generate random chatIds that match Convex ID format
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z0-9]{20,40}$/),
          async (chatId) => {
            // Clean up before each render
            cleanup();
            
            // First render - open modal
            const { unmount } = render(
              <ShareModal
                isOpen={true}
                onClose={() => {}}
                chatId={chatId}
                chatTitle="Test Chat"
              />
            );

            // Get the share link from first render
            const input1 = await waitFor(() => {
              const el = document.querySelector('[data-testid="share-link-input"]') as HTMLInputElement;
              if (!el) throw new Error('Input not found');
              return el;
            }, { timeout: 1000 });
            
            const firstUrl = input1.value;

            // Unmount and cleanup
            unmount();
            cleanup();

            // Second render - open modal again with same chatId
            render(
              <ShareModal
                isOpen={true}
                onClose={() => {}}
                chatId={chatId}
                chatTitle="Test Chat"
              />
            );

            // Get the share link from second render
            const input2 = await waitFor(() => {
              const el = document.querySelector('[data-testid="share-link-input"]') as HTMLInputElement;
              if (!el) throw new Error('Input not found');
              return el;
            }, { timeout: 1000 });
            
            const secondUrl = input2.value;

            // Verify both URLs are identical (idempotent)
            expect(firstUrl).toBe(secondUrl);
            expect(firstUrl).toBe(`http://localhost:3000/share/${chatId}`);
          }
        ),
        { numRuns: 20 }
      );
    } finally {
      // Restore original origin
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          origin: originalOrigin
        },
        writable: true
      });
    }
  });

  test("Property 9: Social Share URL Propagation - Feature: chat-share-feature, Property 9: Social Share URL Propagation", async () => {
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
      // Generate random chatIds and chat titles
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z0-9]{20,40}$/),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (chatId, chatTitle) => {
            // Clean up before each render
            cleanup();
            
            // Mock navigator.share to capture the parameters
            let sharedUrl = '';
            let sharedTitle = '';
            Object.defineProperty(navigator, 'share', {
              value: async (data: { title?: string; url?: string }) => {
                sharedUrl = data.url || '';
                sharedTitle = data.title || '';
                return Promise.resolve();
              },
              writable: true,
              configurable: true
            });
            
            render(
              <ShareModal
                isOpen={true}
                onClose={() => {}}
                chatId={chatId}
                chatTitle={chatTitle}
              />
            );

            // Wait for the social share button to appear
            const shareButton = await waitFor(() => {
              const el = document.querySelector('[data-testid="social-share-button"]');
              if (!el) throw new Error('Social share button not found');
              return el as HTMLElement;
            }, { timeout: 1000 });
            
            // Click the social share button
            shareButton.click();

            // Wait for the share API to be called
            await waitFor(() => {
              if (sharedUrl === '') throw new Error('Share API not called');
            }, { timeout: 1000 });

            // Verify correct URL passed to sharing API
            const expectedUrl = `http://localhost:3000/share/${chatId}`;
            expect(sharedUrl).toBe(expectedUrl);
            
            // Verify URL is complete (includes domain and path)
            expect(sharedUrl).toMatch(/^https?:\/\//);
            expect(sharedUrl).toContain('/share/');
            expect(sharedUrl).toContain(chatId);
            
            // Verify title is passed correctly
            const trimmedTitle = chatTitle.trim();
            const expectedTitle = trimmedTitle || 'Conversation';
            expect(sharedTitle).toBe(expectedTitle);
          }
        ),
        { numRuns: 20 }
      );
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
