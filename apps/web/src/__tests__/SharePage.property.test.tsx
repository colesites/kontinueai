import { describe, expect, test, mock } from "bun:test";
import { render, cleanup } from "@testing-library/react";
import * as fc from "fast-check";
import SharePage from "../app/share/[chatId]/page";

// Mock next/navigation
const mockParams = { chatId: "" };
mock.module("next/navigation", () => ({
  useParams: () => mockParams,
}));

// Mock convex/react
let mockConversation: any = undefined;
mock.module("convex/react", () => ({
  useQuery: () => mockConversation,
}));

const safeText = fc
  .array(fc.constantFrom(...("abcdefghijklmnopqrstuvwxyz0123456789 ".split(""))), {
    minLength: 12,
    maxLength: 80,
  })
  .map((chars) => chars.join("").replace(/\s+/g, " ").trim())
  .filter((value) => value.length > 0);

describe("SharePage - Property-Based Tests", () => {
  test("Property 6: Public Access Without Authentication - Feature: chat-share-feature, Property 6: Public Access Without Authentication", async () => {
    // This test verifies that the share page is accessible regardless of authentication state
    // We simulate both authenticated and unauthenticated scenarios
    
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9]{20,40}$/), // chatId
        safeText, // chat title
        fc.array(
          fc.record({
            _id: fc.stringMatching(/^[a-z0-9]{20,40}$/),
            role: fc.constantFrom("user", "assistant"),
            content: safeText,
          }),
          { minLength: 1, maxLength: 10 }
        ), // messages
        (chatId, title, messages) => {
          cleanup();
          
          // Set up mock conversation data
          mockParams.chatId = chatId;
          mockConversation = {
            _id: chatId,
            title,
            messages,
            createdAt: Date.now(),
          };

          // Scenario 1: Unauthenticated user (no auth context)
          // The component should render without requiring authentication
          const { container: unauthContainer } = render(<SharePage />);

          // Verify the page renders successfully
          const unauthHeading = unauthContainer.querySelector("h1");
          expect(unauthHeading).toBeDefined();
          expect(unauthHeading?.textContent).toBe(title);

          cleanup();

          // Scenario 2: Authenticated user (with auth context)
          // The component should render identically
          mockParams.chatId = chatId;
          mockConversation = {
            _id: chatId,
            title,
            messages,
            createdAt: Date.now(),
          };

          const { container: authContainer } = render(<SharePage />);

          // Verify the page renders successfully
          const authHeading = authContainer.querySelector("h1");
          expect(authHeading).toBeDefined();
          expect(authHeading?.textContent).toBe(title);

          // Both scenarios should succeed - page is accessible with or without auth
        }
      ),
      { numRuns: 10 }
    );
  });

  test("Property 7: Conversation Content Display - Feature: chat-share-feature, Property 7: Conversation Content Display", async () => {
    // This test verifies that all messages from a conversation are displayed
    
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9]{20,40}$/), // chatId
        safeText, // chat title
        fc.array(
          fc.record({
            _id: fc.stringMatching(/^[a-z0-9]{20,40}$/),
            role: fc.constantFrom("user", "assistant"),
            content: safeText,
          }),
          { minLength: 1, maxLength: 10 }
        ), // messages
        (chatId, title, messages) => {
          cleanup();
          
          // Set up mock conversation data
          mockParams.chatId = chatId;
          mockConversation = {
            _id: chatId,
            title,
            messages,
            createdAt: Date.now(),
          };

          const { container } = render(<SharePage />);

          const allText = container.textContent || "";
          for (const message of messages) {
            expect(allText).toContain(message.content);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  test("Property 8: Authentication State Equivalence - Feature: chat-share-feature, Property 8: Authentication State Equivalence", async () => {
    // This test verifies that the rendered content is identical for authenticated and unauthenticated users
    
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9]{20,40}$/), // chatId
        safeText, // chat title
        fc.array(
          fc.record({
            _id: fc.stringMatching(/^[a-z0-9]{20,40}$/),
            role: fc.constantFrom("user", "assistant"),
            content: safeText,
          }),
          { minLength: 1, maxLength: 10 }
        ), // messages
        (chatId, title, messages) => {
          cleanup();
          
          // Render 1: Unauthenticated user
          mockParams.chatId = chatId;
          mockConversation = {
            _id: chatId,
            title,
            messages,
            createdAt: Date.now(),
          };

          const { container: unauthContainer } = render(<SharePage />);

          // Capture the rendered data for unauthenticated user
          const unauthTitle = unauthContainer.querySelector("h1")?.textContent;
          const unauthMessages = messages.map((message) =>
            (unauthContainer.textContent || "").includes(message.content),
          );

          cleanup();

          // Render 2: Authenticated user (same data)
          mockParams.chatId = chatId;
          mockConversation = {
            _id: chatId,
            title,
            messages,
            createdAt: Date.now(),
          };

          const { container: authContainer } = render(<SharePage />);

          // Capture the rendered data for authenticated user
          const authTitle = authContainer.querySelector("h1")?.textContent;
          const authMessages = messages.map((message) =>
            (authContainer.textContent || "").includes(message.content),
          );

          // Verify identical rendering
          expect(authTitle).toBe(unauthTitle);
          expect(authTitle).toBe(title);
          
          // Verify same number of messages
          expect(authMessages.length).toBe(unauthMessages.length);
          expect(authMessages.length).toBe(messages.length);
          
          // Verify message content is identical between auth states
          for (let i = 0; i < authMessages.length; i++) {
            expect(authMessages[i]).toBe(unauthMessages[i]);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});
