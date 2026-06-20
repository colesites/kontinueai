# Web Testing Roadmap

This document is the ordered testing plan for the Kontinue AI web application and its supporting Convex backend. Work through the phases in order. Do not mark a phase complete until its required tests pass in CI and its acceptance criteria are satisfied.

## Status

- [ ] Not started
- [~] In progress
- [x] Complete

Current next phase: **1 — Authentication, authorization, and data isolation**.

## Testing strategy

We will use both approaches:

- **White-box testing:** unit tests, React component/hook tests, API branch tests, and Convex function tests.
- **Black-box testing:** Playwright browser tests against a production-like preview deployment.

We will cover these functional levels:

- **Unit:** isolated functions, hooks, and components.
- **Integration:** modules working together, API routes with dependencies, and Convex functions with a test database.
- **System/E2E:** complete workflows through the browser and deployed services.
- **Sanity/smoke:** a small critical suite run after every deployment.

Non-functional security, accessibility, performance, resilience, responsive-layout, and cross-browser testing is consolidated in Phase 13, but security assertions must also be written alongside every earlier feature.

## Current baseline

As of June 20, 2026:

- Web unit/component suite: **50 passing tests**.
- Convex suite: **8 passing tests**.
- Core helper suite: **7 passing tests** when run manually.
- Web TypeScript check: passing.
- Web production build: passing.
- Web lint: failing because of an existing formatting/lint backlog.
- Automated browser/E2E tests: none.
- CI workflow: none.
- API route test coverage: 0 of 15 routes.
- True Convex database integration coverage: none.

The existing Bun coverage percentage only includes modules loaded by tests. It must not be treated as whole-application coverage.

## Test environments

1. **Unit environment:** Bun Test, Happy DOM, Testing Library, deterministic mocks.
2. **Backend integration environment:** isolated Convex test database and mocked external APIs.
3. **Preview E2E environment:** Vercel Preview, Clerk test users, sandbox connector accounts, and Playwright.
4. **Production smoke environment:** read-only or reversible checks against `chat.kontinueai.com`.

Use at least these test identities:

- Free user A
- Starter user A
- Pro user A
- Pro user B for cross-user isolation tests
- Dedicated OAuth test accounts for every connector

Never use personal connector accounts or production customer data in automated tests.

---

# Ordered test phases

## 1. Authentication, authorization, and cross-user isolation — Critical

Goal: establish the security boundary that every other feature depends on.

### 1.1 Authentication routing

- [ ] `AUTH-001` Unauthenticated users are redirected from every protected app page to sign-in.
- [ ] `AUTH-002` Sign-in and sign-up pages remain public.
- [ ] `AUTH-003` A valid Clerk session can open the authenticated app shell.
- [ ] `AUTH-004` Expired or invalid sessions return 401 from protected APIs.
- [ ] `AUTH-005` Signing out removes access to protected pages without exposing stale user data.
- [ ] `AUTH-006` Auth loading states do not briefly render protected content.

### 1.2 Plan authorization

- [ ] `PLAN-001` Free, Starter, and Pro plan values are normalized correctly.
- [ ] `PLAN-002` Free users cannot access paid-only file uploads or models.
- [ ] `PLAN-003` Starter users receive Starter access but not Pro-only access.
- [ ] `PLAN-004` Pro users receive all intended Pro capabilities.
- [ ] `PLAN-005` Kode remains Pro-only when enabled.
- [ ] `PLAN-006` Kode displays Coming soon and rejects build requests in production while disabled.
- [ ] `PLAN-007` UI gates and server-side gates return the same authorization result.
- [ ] `PLAN-008` Changing or canceling a subscription updates access correctly.

### 1.3 Cross-user isolation

For every owned resource, create it as user A and attempt every read/write operation as user B.

- [ ] `ISO-001` Chats and messages.
- [ ] `ISO-002` Uploaded files.
- [ ] `ISO-003` Projects and project chat assignments.
- [ ] `ISO-004` Tasks and reminders.
- [ ] `ISO-005` Memories.
- [ ] `ISO-006` Canvas creations, likes, and credits.
- [ ] `ISO-007` Import and export jobs.
- [ ] `ISO-008` Notifications and push subscriptions.
- [ ] `ISO-009` Connector metadata and encrypted tokens.
- [ ] `ISO-010` Feedback edits/deletes that require ownership.
- [ ] `ISO-011` Kode projects, files, messages, builds, and credits.

### 1.4 Security branch tests

- [ ] Missing authentication returns 401 rather than 500.
- [ ] Insufficient plan returns 403 with a stable error code.
- [ ] Missing resources and resources owned by another user do not leak different sensitive details.
- [ ] Server functions never authorize from a client-supplied user ID.
- [ ] Shared server secrets are rejected when missing or incorrect.

### Required levels

- Unit tests for plan normalization and access helpers.
- Route integration tests for 401/403 behavior.
- Convex integration tests with two authenticated identities.
- Playwright tests for sign-in, sign-out, redirects, and plan-gated UI.

### Completion criteria

- [ ] All protected pages and APIs are represented in an authorization matrix.
- [ ] All owned Convex resource groups pass user A/user B isolation tests.
- [ ] No client-only gate is relied upon for security.
- [ ] All Phase 1 tests pass in CI.

---

## 2. Core chat send, stream, persist, and reload flow — Critical

- [ ] `CHAT-001` Create a new chat on the first message.
- [ ] `CHAT-002` Send a message and render streamed assistant tokens.
- [ ] `CHAT-003` Stop generation and preserve the partial response correctly.
- [ ] `CHAT-004` Persist user and assistant messages in the correct order.
- [ ] `CHAT-005` Reload the route and restore the complete conversation.
- [ ] `CHAT-006` Continue an existing chat without creating a duplicate chat.
- [ ] `CHAT-007` Generate and persist a chat title.
- [ ] `CHAT-008` Retry an assistant response.
- [ ] `CHAT-009` Edit a user message and regenerate from the correct point.
- [ ] `CHAT-010` Delete messages after an edited/retried turn safely.
- [ ] `CHAT-011` Prevent duplicate sends from double-clicks or repeated Enter presses.
- [ ] `CHAT-012` Handle navigation during an active stream.
- [ ] `CHAT-013` Restore the correct chat after temporary network loss.
- [ ] `CHAT-014` Render markdown, tables, links, code, images, and tool results safely.
- [ ] `CHAT-015` Desktop and mobile turn navigation follows the same conversation order.

Required: helper unit tests, hook/component integration tests, Convex persistence tests, and one full Playwright chat workflow.

---

## 3. Chat errors, quotas, model routing, and tool routing — Critical

- [ ] `CHATERR-001` Invalid request bodies return 400.
- [ ] `CHATERR-002` Oversized input returns the friendly input-too-long response.
- [ ] `CHATERR-003` Token limits are enforced for each plan.
- [ ] `CHATERR-004` Monthly usage is recorded once per completed response.
- [ ] `CHATERR-005` Aborted or failed responses do not overcharge usage.
- [ ] `CHATERR-006` Free and paid default models resolve correctly.
- [ ] `CHATERR-007` Unsupported or unavailable model IDs are rejected or safely replaced.
- [ ] `CHATERR-008` OpenRouter fallback order works as configured.
- [ ] `CHATERR-009` Image/video requests route to the correct generation tool.
- [ ] `CHATERR-010` Web-search requests route to the real application search implementation.
- [ ] `CHATERR-011` Search quotas and exhausted-quota messaging work.
- [ ] `CHATERR-012` Time, task, memory, connector, and email tools are attached only when allowed.
- [ ] `CHATERR-013` Provider timeouts, rate limits, invalid responses, and empty responses are handled.
- [ ] `CHATERR-014` Tool output cannot inject unauthorized system instructions.

Replace documentation-only model/search tests with assertions against production routing code.

---

## 4. Connectors and OAuth lifecycle — Critical

Providers, in this order:

1. Gmail
2. Google Calendar
3. Google Drive
4. GitHub
5. Notion
6. Vercel
7. Todoist

Run the following contract for every provider:

- [ ] `CONN-001` Connector catalog metadata and required environment variables are valid.
- [ ] `CONN-002` OAuth start creates the correct authorization URL.
- [ ] `CONN-003` OAuth state is unpredictable, stored safely, and checked on callback.
- [ ] `CONN-004` Unknown providers are rejected.
- [ ] `CONN-005` Return paths cannot create an open redirect.
- [ ] `CONN-006` Successful callback exchanges and stores the token.
- [ ] `CONN-007` Denied consent and provider errors return a useful status.
- [ ] `CONN-008` Invalid, missing, expired, and replayed OAuth state is rejected.
- [ ] `CONN-009` Tokens are encrypted at rest and never returned to the browser.
- [ ] `CONN-010` Expired access tokens refresh correctly.
- [ ] `CONN-011` Refresh failure produces a reconnect instruction.
- [ ] `CONN-012` Disconnect removes access and connector metadata.
- [ ] `CONN-013` A basic read operation succeeds through chat.
- [ ] `CONN-014` User A cannot read or refresh user B's token.
- [ ] `CONN-015` Tokens and secrets never appear in logs, errors, or model output.
- [ ] `CONN-016` Kode allows only the documented read-only connector actions.

Additional Gmail tests:

- [ ] Email draft creation never sends automatically.
- [ ] Gmail send validates recipient, subject, body, and authentication.
- [ ] Explicit send succeeds through a dedicated Gmail test account.
- [ ] Gmail API errors are shown without leaking token material.

Use mocked provider APIs in normal CI and scheduled live contract tests with dedicated sandbox accounts.

---

## 5. Files and chat attachments — High

- [ ] `FILE-001` Authentication is required for upload and delete.
- [ ] `FILE-002` Plan restrictions distinguish images from paid-only file types.
- [ ] `FILE-003` Allowed extensions and MIME types are accepted.
- [ ] `FILE-004` Disallowed or mismatched types are rejected.
- [ ] `FILE-005` Per-file size limits are enforced.
- [ ] `FILE-006` Per-message attachment counts are enforced.
- [ ] `FILE-007` Upload failures clean up partial records/blobs.
- [ ] `FILE-008` Files attach to the correct chat/message.
- [ ] `FILE-009` User A cannot read/delete user B's file.
- [ ] `FILE-010` Delete removes both the storage object and Convex record.
- [ ] `FILE-011` Attachment preview and removal work before sending.
- [ ] `FILE-012` Text, image, JSON, and unsupported attachments render correctly.
- [ ] `FILE-013` Malicious filenames/content cannot execute in the UI.

---

## 6. Canvas image/video generation, jobs, gallery, and credits — High

- [ ] `CANVAS-001` Image/video mode switching preserves only valid settings.
- [ ] `CANVAS-002` Model, aspect-ratio, duration, resolution, and audio compatibility rules.
- [ ] `CANVAS-003` Plan restrictions for every generation model.
- [ ] `CANVAS-004` Credit cost calculation and insufficient-credit behavior.
- [ ] `CANVAS-005` Atomic deduction prevents double spending.
- [ ] `CANVAS-006` Failed generation refunds according to policy.
- [ ] `CANVAS-007` Image generation routes correctly for every supported provider.
- [ ] `CANVAS-008` Video generation routes correctly for every supported provider.
- [ ] `CANVAS-009` Async video job creation, progress callback, completion, and failure.
- [ ] `CANVAS-010` Callback secret rejects unauthorized updates.
- [ ] `CANVAS-011` Gallery lists only the correct user's creations.
- [ ] `CANVAS-012` Publish, unpublish, like, unlike, and delete.
- [ ] `CANVAS-013` Generated media URLs and failed assets render safely.
- [ ] `CANVAS-014` Mobile and desktop Canvas workflows.

---

## 7. Tasks, reminders, push notifications, and scheduled agents — High

- [ ] `TASK-001` Create, read, update, complete, reopen, and delete tasks.
- [ ] `TASK-002` List, calendar, and Kanban views stay consistent.
- [ ] `TASK-003` Due date/time conversion uses the user's timezone.
- [ ] `TASK-004` Daily, weekly, monthly, weekday, and custom recurrence rules.
- [ ] `TASK-005` Reminder scheduling and cancellation.
- [ ] `TASK-006` Permission denied and unsupported push-notification states.
- [ ] `TASK-007` Save, replace, and delete browser push subscriptions.
- [ ] `TASK-008` Reminder delivery succeeds once without duplicate notifications.
- [ ] `TASK-009` Scheduled agent execution validates its shared secret.
- [ ] `TASK-010` Scheduled agents use the correct owner context and connector identity.
- [ ] `TASK-011` Failed scheduled runs produce safe notifications and retries.
- [ ] `TASK-012` Completed runs persist a readable result chat.

---

## 8. Conversation imports — High

- [ ] `IMPORT-001` Detect ChatGPT, Claude, Gemini, Perplexity, and generic formats.
- [ ] `IMPORT-002` Parse valid exports from every provider.
- [ ] `IMPORT-003` Preserve roles, ordering, code blocks, markdown, and Unicode.
- [ ] `IMPORT-004` Reject empty, malformed, oversized, and unsupported exports.
- [ ] `IMPORT-005` URL preview requires authentication and validates URLs.
- [ ] `IMPORT-006` Scrape route handles provider errors and scraper timeouts.
- [ ] `IMPORT-007` Preview does not persist data.
- [ ] `IMPORT-008` Commit persists exactly the previewed conversation.
- [ ] `IMPORT-009` Upload limits and import job status transitions.
- [ ] `IMPORT-010` Cancel and retry behavior.
- [ ] `IMPORT-011` Imported content cannot execute scripts or inject unsafe links.
- [ ] `IMPORT-012` Imported chat can be continued normally.

---

## 9. Projects and sidebar chat management — Medium

- [ ] `PROJECT-001` Create, rename, update, archive, restore, and delete a project.
- [ ] `PROJECT-002` Assign and unassign chats.
- [ ] `PROJECT-003` Project chat counts remain correct.
- [ ] `PROJECT-004` Deleting a project follows the intended chat retention policy.
- [ ] `SIDEBAR-001` List and order recent chats.
- [ ] `SIDEBAR-002` Search returns only the owner's matching chats.
- [ ] `SIDEBAR-003` Rename, pin/unpin, archive/restore, and delete.
- [ ] `SIDEBAR-004` Optimistic changes roll back on failure.
- [ ] `SIDEBAR-005` Keyboard shortcut focuses search.
- [ ] `SIDEBAR-006` Mobile navigation closes after selection.
- [ ] `SIDEBAR-007` More menu shows the correct Kode state.

---

## 10. Memory, settings, usage, and data exports — Medium

- [ ] `MEM-001` Memory limits for Free, Starter, and Pro.
- [ ] `MEM-002` Create, retrieve, rank, pin, and delete memory.
- [ ] `MEM-003` Quota exhaustion does not break chat.
- [ ] `MEM-004` User A cannot retrieve user B's memory.
- [ ] `MEM-005` Memory context respects token and result limits.
- [ ] `MEM-006` Disabled memory does not enter model context.
- [ ] `SETTINGS-001` Read and update default model.
- [ ] `SETTINGS-002` Theme/profile settings persist.
- [ ] `SETTINGS-003` Usage panel matches recorded usage.
- [ ] `EXPORT-001` Request, list, download, and delete exports.
- [ ] `EXPORT-002` Export contains only the requesting user's data.
- [ ] `EXPORT-003` Expired and unauthorized download URLs fail safely.
- [ ] `EXPORT-004` Export job failure and retry behavior.

---

## 11. Feedback and public sharing — Medium

### Feedback

- [ ] `FEEDBACK-001` List and filter posts.
- [ ] `FEEDBACK-002` Create valid posts and reject invalid content.
- [ ] `FEEDBACK-003` Vote/unvote without duplicate votes.
- [ ] `FEEDBACK-004` Add and display comments.
- [ ] `FEEDBACK-005` Only the owner can edit/delete a post.
- [ ] `FEEDBACK-006` Empty, loading, pagination, and error states.
- [ ] `FEEDBACK-007` Modal and composer keyboard/accessibility behavior.

### Sharing

- [ ] `SHARE-001` Keep existing component/property tests.
- [ ] `SHARE-002` Replace the fake Convex fixture test with a real shared-conversation query test.
- [ ] `SHARE-003` Public share page works without authentication.
- [ ] `SHARE-004` Private/deleted/nonexistent chats do not leak content.
- [ ] `SHARE-005` Share page renders a real stored conversation in Playwright.
- [ ] `SHARE-006` Copy and native-share actions work in supported browsers.
- [ ] `SHARE-007` Add the missing accessible dialog description.

---

## 12. Kode pre-launch testing — Medium until launch, Critical before launch

### Production gate

- [ ] `KODE-001` Production displays Coming soon while disabled.
- [ ] `KODE-002` Preview/local environments retain test access.
- [ ] `KODE-003` Production build API returns 503 while disabled.
- [ ] `KODE-004` Enabling the launch flag activates the intended production UI/API.

### Access and composer

- [ ] `KODE-005` Only Pro users can access enabled Kode functionality.
- [ ] `KODE-006` Model is locked to `zai/glm-5.2` server-side.
- [ ] `KODE-007` Build/Plan selector and remaining credits render correctly.
- [ ] `KODE-008` Plan mode does not modify project files.

### Jobs and credits

- [ ] `KODE-009` Project creation and initial queued job.
- [ ] `KODE-010` Build reserves four credits; Plan reserves one.
- [ ] `KODE-011` Usage reconciles at one credit per 25,000 reported tokens.
- [ ] `KODE-012` Successful jobs refund unused reservations.
- [ ] `KODE-013` Failed jobs refund the full reservation.
- [ ] `KODE-014` Concurrent requests cannot overspend credits.
- [ ] `KODE-015` Monthly reset behavior.
- [ ] `KODE-016` Worker secret rejects unauthorized requests.
- [ ] `KODE-017` Missing worker configuration fails safely and refunds credits.
- [ ] `KODE-018` Queue, generation, completion, and failure statuses persist.

### Worker and sandbox

- [ ] `KODE-019` Generated output contains exactly the allowed files.
- [ ] `KODE-020` File count, path, and byte limits.
- [ ] `KODE-021` Safety scanner rejects external scripts, eval, Function, and service workers.
- [ ] `KODE-022` Sandbox network policy is deny-all.
- [ ] `KODE-023` Invalid JavaScript fails sandbox validation.
- [ ] `KODE-024` Valid projects complete and render in the preview iframe.
- [ ] `KODE-025` Preview CSP and iframe sandbox prevent parent-app access.
- [ ] `KODE-026` Connector tools remain read-only and owner-scoped.

### Project lifecycle

- [ ] `KODE-027` Workspace loads files, messages, builds, and credits.
- [ ] `KODE-028` Rename, star/unstar, and delete.
- [ ] `KODE-029` Manual file editing and saving.
- [ ] `KODE-030` Version changes refresh the preview.
- [ ] `KODE-031` Downloaded HTML has a safe filename and includes project assets.
- [ ] `KODE-032` User A cannot access user B's project or worker payload.

---

## 13. Cross-cutting non-functional testing — Required before release

### Security

- [ ] Dependency and secret scanning.
- [ ] CSRF tests for state-changing routes and OAuth flows.
- [ ] XSS tests for chat markdown, imports, feedback, filenames, and Kode previews.
- [ ] Open redirect tests.
- [ ] Rate-limit tests for expensive AI and provider routes.
- [ ] Prompt-injection tests for web search and connector outputs.
- [ ] Verify secrets/tokens never enter logs, Sentry events, browser payloads, or model context.
- [ ] Verify the current supported Next.js release contains all relevant security patches.

### Accessibility

- [ ] Automated axe checks on every major page and modal.
- [ ] Keyboard-only navigation.
- [ ] Focus trapping/restoration for dialogs.
- [ ] Screen-reader labels and status announcements.
- [ ] Color contrast at WCAG AA.
- [ ] Reduced-motion behavior.

### Performance

- [ ] Lighthouse budgets for home, chat, Canvas, Tasks, Settings, and public share.
- [ ] Initial bundle and route bundle budgets.
- [ ] Chat rendering with long conversations.
- [ ] Sidebar/search performance with many chats/projects.
- [ ] Memory and API latency budgets.
- [ ] Image optimization and layout-shift checks.

### Reliability

- [ ] Offline and intermittent-network states.
- [ ] Provider timeout/rate-limit recovery.
- [ ] Idempotency for retries and callbacks.
- [ ] No duplicate credits, messages, tasks, jobs, or notifications.
- [ ] Background jobs recover or fail terminally without remaining stuck.

### Compatibility and responsive behavior

- [ ] Chromium desktop and mobile.
- [ ] WebKit/Safari desktop and mobile.
- [ ] Firefox desktop.
- [ ] Phone, tablet, laptop, and wide desktop layouts.
- [ ] Light and dark themes.

### Observability

- [ ] Expected errors produce structured logs without secrets.
- [ ] Unexpected route/job errors reach Sentry.
- [ ] Critical job failures include actionable context.
- [ ] Smoke-test failures alert the team.

---

# Deployment smoke suite

Run this small black-box suite after every preview and production deployment:

- [ ] Public pages load.
- [ ] Sign-in page loads.
- [ ] Protected page redirects when signed out.
- [ ] Test user signs in.
- [ ] New chat sends and receives a response.
- [ ] Chat persists after reload.
- [ ] Sidebar lists the chat.
- [ ] One connector status page loads without exposing tokens.
- [ ] Canvas page loads and shows the correct credit state.
- [ ] Tasks page loads and a reversible test task can be created/deleted.
- [ ] Production Kode state matches the launch flag.
- [ ] Sign-out succeeds.

# CI gates to add

Every pull request should eventually require:

1. Web typecheck.
2. Convex typecheck/codegen validation.
3. Biome lint with no new violations.
4. Unit/component tests.
5. Convex integration tests.
6. API integration tests.
7. Production build.
8. Playwright critical-path suite against a preview deployment.
9. Coverage report with agreed thresholds.

Suggested initial thresholds should apply to changed code, then rise as the backlog is covered. Do not enforce the current misleading loaded-module percentage as whole-project coverage.

# Definition of done for each phase

A phase is complete only when:

- [ ] Happy paths and failure paths are covered.
- [ ] Authentication, authorization, and cross-user isolation are covered.
- [ ] Tests use production modules rather than reimplementing their behavior in fixtures.
- [ ] External providers are mocked deterministically in normal CI.
- [ ] At least one black-box workflow covers the user-visible path when applicable.
- [ ] Tests pass locally and in CI.
- [ ] Flaky tests are fixed, not silently retried or skipped.
- [ ] The checklist and test names in this document are updated.

# Commands

Current commands:

```bash
bun run --cwd apps/web test
bun run --cwd apps/web check-types
bun run --cwd apps/web lint
bun run build:web
bun run test:convex
bun test packages/core/src/memory.test.ts packages/core/src/kode-web.test.ts
```

The standard root test command does not currently execute the Core helper tests. Add them to CI or create a dedicated `test:core` script when the test infrastructure work begins.
