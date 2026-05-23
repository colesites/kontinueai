/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as canvas from "../canvas.js";
import type * as chats from "../chats.js";
import type * as feedback from "../feedback.js";
import type * as files from "../files.js";
import type * as firecrawl from "../firecrawl.js";
import type * as memories from "../memories.js";
import type * as memoryWorkers from "../memoryWorkers.js";
import type * as messages from "../messages.js";
import type * as titleGenerator from "../titleGenerator.js";
import type * as users from "../users.js";
import type * as whitelist from "../whitelist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  canvas: typeof canvas;
  chats: typeof chats;
  feedback: typeof feedback;
  files: typeof files;
  firecrawl: typeof firecrawl;
  memories: typeof memories;
  memoryWorkers: typeof memoryWorkers;
  messages: typeof messages;
  titleGenerator: typeof titleGenerator;
  users: typeof users;
  whitelist: typeof whitelist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  firecrawlScrape: import("convex-firecrawl-scrape/_generated/component.js").ComponentApi<"firecrawlScrape">;
};
