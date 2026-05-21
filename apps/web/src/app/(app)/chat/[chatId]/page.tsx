import { Suspense } from "react";
import { ChatClient } from "../../../../features/chat/components/ChatClient";
import Spinner from "../../../../components/Spinner";

// Required for Cache Components - provide at least one param for validation
export async function generateStaticParams() {
  // Return a placeholder - actual chats are dynamic
  return [{ chatId: "placeholder" }];
}

export default function ChatPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ChatClient />
    </Suspense>
  );
}
