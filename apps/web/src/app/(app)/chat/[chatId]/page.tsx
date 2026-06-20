import { Suspense } from "react";
import Spinner from "../../../../components/Spinner";
import { ChatClient } from "../../../../features/chat/components/ChatClient";

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
