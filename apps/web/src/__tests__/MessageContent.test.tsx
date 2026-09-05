import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
		render(
			<MessageContent content="https://example.com/this-is-a-very-long-link-with-no-natural-break-points-at-all" />,
		);

		const paragraph = screen.getByTestId("message-content-paragraph");
		expect(paragraph.className).toContain("wrap-anywhere");
	});

	test("renders a citation icon on its own line as a chip, not a full-size image", () => {
		const { container } = render(
			<MessageContent
				content={[
					"Resend's inbound domain processes mail for that domain.",
					"",
					"![Resend+1](https://resend.com/favicon.ico)",
				].join("\n")}
			/>,
		);

		const image = container.querySelector("img");
		expect(image?.getAttribute("width")).toBe("16");
		expect(container.textContent).toContain("Resend+1");
	});

	test("renders a citation icon inline with text as a chip", () => {
		const { container } = render(
			<MessageContent content="Mail goes to that domain. ![Resend+1](https://resend.com/favicon.ico)" />,
		);

		expect(container.querySelector("img")?.getAttribute("width")).toBe("16");
	});

	test("treats a logo image as a chip even without a source count", () => {
		const { container } = render(
			<MessageContent content="![LinkedIn](https://static.example.com/icons/linkedin-logo.png)" />,
		);

		expect(container.querySelector("img")?.getAttribute("width")).toBe("16");
	});

	test("keeps a real content image at full size with intrinsic sizing", () => {
		const { container } = render(
			<MessageContent content="![A generated landscape](https://cdn.example.com/generated/landscape.png)" />,
		);

		const image = container.querySelector("img");
		expect(image?.getAttribute("width")).toBe("800");
		expect(image?.className).toContain("h-auto");
		expect(image?.className).toContain("w-auto");
	});

	test("renders a source icon labelled with a bare domain as a chip", () => {
		const { container } = render(
			<MessageContent
				content={[
					"He also holds the record for most Ballon d'Or wins.",
					"",
					"![en.wikipedia.org](https://en.wikipedia.org/static/apple-touch/wikipedia.png)",
				].join("\n")}
			/>,
		);

		expect(container.querySelector("img")?.getAttribute("width")).toBe("16");
		expect(container.textContent).toContain("en.wikipedia.org");
	});

	test("citation chips opt out of prose so typography cannot inflate them", () => {
		// Tailwind Typography gives every `img` a 2em vertical margin, which grew
		// the chip to roughly three times the line height inside a chat message.
		const { container } = render(
			<MessageContent content="Award cycle. [![editorial.uefa.com](https://cdn.example.com/favicon.ico)](https://editorial.uefa.com/b)" />,
		);

		const chip = container.querySelector("a");
		expect(chip?.className).toContain("not-prose");
		expect(chip?.querySelector("img")).not.toBeNull();
		expect(chip?.textContent).toContain("editorial.uefa.com");
	});

	test("a content image is expandable", () => {
		const { container } = render(
			<MessageContent content="![Screenshot 2026-09-04.png](https://cdn.example.com/shot.png)" />,
		);

		const trigger = container.querySelector('button[title="Expand image"]');
		expect(trigger).not.toBeNull();
		expect(trigger?.querySelector("img")?.getAttribute("width")).toBe("800");
	});

	test("an attachment stays a picture even beside text in the same paragraph", () => {
		const { container } = render(
			<MessageContent
				content={
					"![Screenshot 2026-09-04.png](https://cdn.example.com/shot.png)\nhello"
				}
			/>,
		);

		expect(
			container.querySelector('button[title="Expand image"]'),
		).not.toBeNull();
		expect(container.querySelector("img")?.getAttribute("width")).toBe("800");
	});

	test("the lightbox renders outside the paragraph", () => {
		const { container } = render(
			<MessageContent content="![shot.png](https://cdn.example.com/shot.png)" />,
		);

		const trigger = container.querySelector(
			'button[title="Expand image"]',
		) as HTMLButtonElement;
		fireEvent.click(trigger);

		const dialog = document.querySelector('[role="dialog"]');
		expect(dialog).not.toBeNull();
		expect(dialog?.closest("p")).toBeNull();
		expect(dialog?.parentElement).toBe(document.body);
	});

	test("an upload labelled without a file extension is still a picture", () => {
		const { container } = render(
			<MessageContent
				content={
					"![Uploaded image preview](https://lh3.googleusercontent.com/gg/abc)\nWhat do you think"
				}
			/>,
		);

		expect(
			container.querySelector('button[title="Expand image"]'),
		).not.toBeNull();
	});
});
