import { describe, expect, test } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ShareButton } from "../components/ShareButton";

describe("ShareButton - Unit Tests", () => {
  test("renders button with LuShare icon", () => {
    cleanup();
    render(<ShareButton chatId="test-chat-123" chatTitle="Test Chat" />);
    
    // Check that the button is rendered
    const button = screen.getByRole("button", { name: /share chat/i });
    expect(button).toBeDefined();
    
    // Check that the button has the correct styling classes
    expect(button.className).toContain("hover:bg-secondary/80");
    expect(button.className).toContain("rounded-lg");
    expect(button.className).toContain("focus-visible:ring-2");
  });

  test("opens modal on click", async () => {
    cleanup();
    const user = userEvent.setup();
    render(<ShareButton chatId="test-chat-123" chatTitle="Test Chat" />);
    
    // Initially, modal should not be visible
    expect(screen.queryByText(/Share Test Chat/i)).toBeNull();
    
    // Click the share button
    const button = screen.getByRole("button", { name: /share chat/i });
    await user.click(button);
    
    // Modal should now be visible
    expect(screen.getByText(/Share Test Chat/i)).toBeDefined();
  });

  test("passes correct props to modal", async () => {
    cleanup();
    const user = userEvent.setup();
    const testChatId = "chat-456";
    const testChatTitle = "My Important Chat";
    
    render(<ShareButton chatId={testChatId} chatTitle={testChatTitle} />);
    
    // Click the share button to open modal
    const button = screen.getByRole("button", { name: /share chat/i });
    await user.click(button);
    
    // Verify modal displays correct chat title
    expect(screen.getByText(`Share ${testChatTitle}`)).toBeDefined();
    
    // Verify the share link contains the correct chatId
    const input = screen.getByTestId("share-link-input") as HTMLInputElement;
    expect(input.value).toContain(`/share/${testChatId}`);
  });

  test("closes modal when close is triggered", async () => {
    cleanup();
    const user = userEvent.setup();
    render(<ShareButton chatId="test-chat-789" chatTitle="Another Chat" />);
    
    // Open the modal
    const shareButton = screen.getByRole("button", { name: /share chat/i });
    await user.click(shareButton);
    
    // Modal should be visible
    expect(screen.getByText(/Share Another Chat/i)).toBeDefined();
    
    // Close the modal
    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);
    
    // Modal should no longer be visible
    expect(screen.queryByText(/Share Another Chat/i)).toBeNull();
  });
});
