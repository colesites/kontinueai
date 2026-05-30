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
import type * as connectors from "../connectors.js";
import type * as crons from "../crons.js";
import type * as exports from "../exports.js";
import type * as exportsWorker from "../exportsWorker.js";
import type * as feedback from "../feedback.js";
import type * as files from "../files.js";
import type * as firecrawl from "../firecrawl.js";
import type * as importParsers from "../importParsers.js";
import type * as imports from "../imports.js";
import type * as importsWorker from "../importsWorker.js";
import type * as lib_encryption from "../lib/encryption.js";
import type * as memories from "../memories.js";
import type * as memoryWorkers from "../memoryWorkers.js";
import type * as messages from "../messages.js";
import type * as notifications from "../notifications.js";
import type * as projects from "../projects.js";
import type * as push from "../push.js";
import type * as r2 from "../r2.js";
import type * as reminderDelivery from "../reminderDelivery.js";
import type * as tasks from "../tasks.js";
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
  connectors: typeof connectors;
  crons: typeof crons;
  exports: typeof exports;
  exportsWorker: typeof exportsWorker;
  feedback: typeof feedback;
  files: typeof files;
  firecrawl: typeof firecrawl;
  importParsers: typeof importParsers;
  imports: typeof imports;
  importsWorker: typeof importsWorker;
  "lib/encryption": typeof lib_encryption;
  memories: typeof memories;
  memoryWorkers: typeof memoryWorkers;
  messages: typeof messages;
  notifications: typeof notifications;
  projects: typeof projects;
  push: typeof push;
  r2: typeof r2;
  reminderDelivery: typeof reminderDelivery;
  tasks: typeof tasks;
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
