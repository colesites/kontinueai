// Message-part readers are shared with the Expo chat screen through @repo/core
// so a tool result renders the same way on both clients.
export {
	type ClockData,
	collectAttachmentsFromParts,
	collectClockDataFromParts,
	collectEmailDraftFromParts,
	collectGeneratedFilesFromParts,
	collectImageUrlsFromParts,
	type EmailDraft,
	type GeneratedFile,
	type MessageAttachment,
	mapImportedFlags,
	mapStoredGeneratedImages,
	mergeImportedChunks,
	pickGeneratedImages,
} from "@repo/core/chat-message-parts";
export {
	buildSearchFallbackContent,
	collectPerplexitySearchResults,
	type SearchResultSummary,
} from "@repo/core/chat-search-results";
