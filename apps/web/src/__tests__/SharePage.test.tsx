import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render, cleanup, waitFor } from "@testing-library/react";
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

describe("SharePage - Unit Tests", () => {
  beforeEach(() => {
    cleanup();
  });

  test("displays loading state while fetching conversation", () => {
    // Set conversation to undefined to simulate loading
    mockParams.chatId = "test-chat-id-123";
    mockConversation = undefined;

    const { container } = render(<SharePage />);

    // Verify loading spinner is displayed
    const spinner = container.querySelector('[class*="animate-spin"]');
    expect(spinner).toBeDefined();
  });

  test("displays 404 error for invalid chatId", async () => {
    // Set conversation to null to simulate not found
    mockParams.chatId = "invalid-chat-id";
    mockConversation = null;

    const { container } = render(<SharePage />);

    // Wait for error message to render
    await waitFor(() => {
      const heading = container.querySelector("h1");
      if (!heading) throw new Error("Heading not found");
    }, { timeout: 1000 });

    // Verify 404 message is displayed
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Conversation Not Found");

    const errorMessage = Array.from(container.querySelectorAll("p")).find(
      (p) => p.textContent?.includes("doesn't exist or has been deleted")
    );
    expect(errorMessage).toBeDefined();
  });

  test("renders conversation title and messages", async () => {
    // Set up mock conversation with messages
    mockParams.chatId = "test-chat-id-456";
    mockConversation = {
      _id: "test-chat-id-456",
      title: "Test Conversation",
      messages: [
        {
          _id: "msg-1",
          role: "user",
          content: "Hello, how are you?",
        },
        {
          _id: "msg-2",
          role: "assistant",
          content: "I'm doing well, thank you!",
        },
      ],
      createdAt: Date.now(),
    };

    const { container } = render(<SharePage />);

    // Wait for content to render
    await waitFor(() => {
      const heading = container.querySelector("h1");
      if (!heading) throw new Error("Heading not found");
    }, { timeout: 1000 });

    // Verify title is displayed
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Test Conversation");

    // Verify "Shared conversation" subtitle
    const subtitle = Array.from(container.querySelectorAll("p")).find(
      (p) => p.textContent === "Shared conversation"
    );
    expect(subtitle).toBeDefined();

    // Verify messages are rendered
    const messageContainers = container.querySelectorAll('[class*="py-3"]');
    expect(messageContainers.length).toBe(2);

    // Verify message content appears
    const allText = container.textContent || "";
    expect(allText).toContain("Hello, how are you?");
    expect(allText).toContain("I'm doing well, thank you!");
  });

  test("displays empty state when conversation has no messages", async () => {
    // Set up mock conversation with no messages
    mockParams.chatId = "empty-chat-id";
    mockConversation = {
      _id: "empty-chat-id",
      title: "Empty Conversation",
      messages: [],
      createdAt: Date.now(),
    };

    const { container } = render(<SharePage />);

    // Wait for content to render
    await waitFor(() => {
      const heading = container.querySelector("h1");
      if (!heading) throw new Error("Heading not found");
    }, { timeout: 1000 });

    // Verify title is displayed
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Empty Conversation");

    // Verify empty state message
    const emptyMessage = Array.from(container.querySelectorAll("p")).find(
      (p) => p.textContent?.includes("no messages yet")
    );
    expect(emptyMessage).toBeDefined();
  });

  test("renders multiple messages in correct order", async () => {
    // Set up mock conversation with multiple messages
    mockParams.chatId = "multi-msg-chat";
    mockConversation = {
      _id: "multi-msg-chat",
      title: "Multi Message Chat",
      messages: [
        { _id: "msg-1", role: "user", content: "First message" },
        { _id: "msg-2", role: "assistant", content: "Second message" },
        { _id: "msg-3", role: "user", content: "Third message" },
        { _id: "msg-4", role: "assistant", content: "Fourth message" },
      ],
      createdAt: Date.now(),
    };

    const { container } = render(<SharePage />);

    // Wait for messages to render
    await waitFor(() => {
      const messageContainers = container.querySelectorAll('[class*="py-3"]');
      if (messageContainers.length === 0) throw new Error("Messages not rendered");
    }, { timeout: 1000 });

    // Verify all messages are rendered
    const messageContainers = container.querySelectorAll('[class*="py-3"]');
    expect(messageContainers.length).toBe(4);

    // Verify all message content appears
    const allText = container.textContent || "";
    expect(allText).toContain("First message");
    expect(allText).toContain("Second message");
    expect(allText).toContain("Third message");
    expect(allText).toContain("Fourth message");
  });
});
