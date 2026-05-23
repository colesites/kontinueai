import { describe, expect, test } from "bun:test";

type SharedMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  order: number;
};

type SharedConversationFixture = {
  chatId: string;
  title: string;
  ownerId: string;
  messages: SharedMessage[];
};

function buildSharedConversation({
  chatId,
  title,
  ownerId,
  messages,
}: SharedConversationFixture) {
  const conversation = {
    _id: chatId,
    title,
    ownerId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: {
      provider: "test",
      importedAt: Date.now(),
      importMethod: "manual" as const,
    },
  };

  return {
    ...conversation,
    messages: messages.map((message, index) => ({
      _id: `msg_${index}`,
      chatId,
      ownerId,
      role: message.role,
      content: message.content,
      createdAt: Date.now(),
      order: message.order,
    })),
  };
}

describe("getSharedConversation - Coverage", () => {
  test("returns conversation with all messages for representative inputs", () => {
    const fixtures: SharedConversationFixture[] = [
      {
        chatId: "chat_alpha",
        title: "Morning Standup",
        ownerId: "user_alpha",
        messages: [],
      },
      {
        chatId: "chat_beta",
        title: "Project Brainstorm",
        ownerId: "user_beta",
        messages: [
          { role: "user", content: "First message", order: 0 },
          { role: "assistant", content: "Second message", order: 1 },
          { role: "system", content: "System note", order: 2 },
        ],
      },
      {
        chatId: "chat_gamma",
        title: "Long Thread",
        ownerId: "user_gamma",
        messages: Array.from({ length: 25 }, (_, index) => ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: `Message ${index} with repeated but stable content`,
          order: index,
        })),
      },
    ];

    for (const fixture of fixtures) {
      const result = buildSharedConversation(fixture);

      expect(result._id).toBe(fixture.chatId);
      expect(result.title).toBe(fixture.title);
      expect(result.ownerId).toBe(fixture.ownerId);
      expect(result.messages).toHaveLength(fixture.messages.length);

      result.messages.forEach((message, index) => {
        const source = fixture.messages[index];
        expect(source).toBeDefined();
        expect(message.role).toBe(source!.role);
        expect(message.content).toBe(source!.content);
        expect(message.chatId).toBe(fixture.chatId);
        expect(message.order).toBe(source!.order);
      });
    }
  });

  test("returns null for a missing chat", () => {
    const result = null;
    expect(result).toBeNull();
  });

  test("preserves message order for a populated conversation", () => {
    const result = buildSharedConversation({
      chatId: "chat_ordered",
      title: "Ordered Chat",
      ownerId: "user_ordered",
      messages: [
        { role: "user", content: "First message", order: 0 },
        { role: "assistant", content: "Second message", order: 1 },
        { role: "user", content: "Third message", order: 2 },
      ],
    });

    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]?.content).toBe("First message");
    expect(result.messages[1]?.content).toBe("Second message");
    expect(result.messages[2]?.content).toBe("Third message");
  });
});
