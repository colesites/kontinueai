import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { MessageContent } from "../features/chat/components/MessageContent";

afterEach(() => {
  cleanup();
});

describe("MessageContent", () => {
  test("wraps markdown tables in a horizontal scroll container", () => {
    render(
      <MessageContent
        content={[
          "| Investor | Notes |",
          "| --- | --- |",
          "| Naval | Rarely responds to cold DMs. |",
        ].join("\n")}
      />,
    );

    const table = screen.getByRole("table");
    expect(table.parentElement?.className).toContain("overflow-x-auto");
  });

  test("applies overflow wrapping to paragraphs", () => {
    const { container } = render(
      <MessageContent content="https://example.com/this-is-a-very-long-link-with-no-natural-break-points-at-all" />,
    );

    const paragraph = screen.getByTestId("message-content-paragraph");
    expect(paragraph.className).toContain("wrap-anywhere");
  });
});
