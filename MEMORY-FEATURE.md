Build a production-ready AI memory system for Kontinue AI using Convex as the primary database and memory engine.

Tech stack:

Next.js
TypeScript
Convex
OpenAI-compatible embeddings
Streaming AI chat architecture
Multi-tenant users
SaaS subscription plans

The system must support:

Persistent AI memory
Semantic memory retrieval
User memory quotas based on subscription plans
Automatic memory summarization
Import/export of user data
Incremental background importing
Memory storage optimization
Fast retrieval
Privacy and isolation per user
==================================================
CORE MEMORY ARCHITECTURE

Create these Convex tables:

users
clerkId or authId
email
name
plan
memoryUsedBytes
memoryLimitBytes
createdAt
updatedAt
conversations
userId
title
summary
lastMessageAt
archived
createdAt
updatedAt
messages
conversationId
userId
role
content
tokenCount
embedding
createdAt
memories
userId
type
Possible values:
preference
personal_fact
project
long_term
summary
workflow
relationship
context
content
compressedContent
embedding
importanceScore
sourceConversationId
sourceMessageIds
byteSize
createdAt
updatedAt
lastAccessedAt
memory_summaries
userId
periodStart
periodEnd
summary
embedding
byteSize
createdAt
import_jobs
userId
status
values:
queued
processing
completed
failed
totalFiles
processedFiles
importedMessages
progress
currentStage
createdAt
updatedAt
import_chunks
importJobId
priority
chunkType
values:
oldest
newest
middle
status
dataRange
createdAt
exports
userId
fileUrl
fileSize
format
createdAt
==================================================
MEMORY LIMIT SYSTEM

Implement strict memory limits based on subscription plans.

Plan limits:

free = 0.5MB
starter = 2GB
pro = 4GB

Requirements:

Before storing any memory, calculate estimated byte size.
Track total memory usage in users.memoryUsedBytes.
If limit exceeded:
stop storing new memories
do NOT break chat functionality
continue conversation normally
return warning state to frontend
Add helper:
canStoreMemory(userId)

Memory calculation must include:

raw text
embeddings
summaries
metadata overhead

Add cleanup strategy:

automatically compress old memories
summarize inactive memories
remove low-importance temporary memories first

Never delete:

pinned memories
user preferences
manually saved memories
==================================================
MEMORY RETRIEVAL SYSTEM

Implement hybrid retrieval:

vector similarity
recency
importance score
keyword search

Flow:

User sends message
Generate embedding
Retrieve relevant memories
Retrieve conversation summaries
Retrieve recent messages
Rank results
Inject best context into AI prompt

Add memory scoring formula:
finalScore =
(vectorSimilarity * 0.5)

(importanceScore * 0.3)
(recencyScore * 0.2)

Limit prompt memory injection size to avoid token explosion.

==================================================
AUTOMATIC MEMORY EXTRACTION

Create AI-based memory extraction pipeline.

The AI should detect:

preferences
repeated behaviors
personal facts
ongoing projects
relationships
recurring tasks
important context

Examples:
"I prefer dark mode"
=> preference memory

"My startup is Kontinue AI"
=> project memory

"I'm studying statistics"
=> personal fact

Avoid storing:

temporary greetings
spam
duplicate memories
irrelevant chat noise

Add deduplication.

==================================================
MEMORY SUMMARIZATION

Implement rolling summaries.

Rules:

Summarize old conversations automatically
Keep recent raw messages
Compress older context into summaries
Store summaries separately

Create:

daily summaries
weekly summaries
conversation summaries

Summaries must still be searchable via embeddings.

==================================================
IMPORT / EXPORT SYSTEM

Implement full export system.

Export formats:

JSON
Markdown
ZIP archive

Export should include:

conversations
memories
summaries
metadata
==================================================
SMART IMPORT SYSTEM

Build a very fast-feeling import architecture inspired by large AI platforms.

GOAL:
Make imports FEEL instant even if the full import takes hours.

When importing:

prioritize oldest conversations first
prioritize newest conversations second
import middle conversations later in background

Why:

oldest chats contain foundational context
newest chats contain active context
middle history is less urgent

Implementation strategy:

PHASE 1 (Immediate Import)
Import:

oldest 1–3 days of conversations
newest 1–2 weeks of conversations

This phase should complete very quickly.

After Phase 1:

user can immediately chat with AI
imported memories already usable
frontend shows:
“Your important memories are ready while the rest continues importing.”

PHASE 2 (Background Import)
Process remaining middle history gradually.

Requirements:

queue-based architecture
resumable imports
background workers
retry failed chunks
progress tracking
chunk prioritization

Chunk priorities:
1 = oldest
2 = newest
3 = middle

Use chunked processing:

split imports into batches
process incrementally
avoid blocking server
==================================================
BACKGROUND PROCESSING

Use Convex scheduled functions/actions for:

embedding generation
memory summarization
cleanup
background imports
compression
deduplication

System must survive:

crashes
refreshes
server restarts
==================================================
FRONTEND FEATURES

Create frontend UI for:

memory usage meter
plan limit progress
export data button
import data page
import progress UI
memory management dashboard
delete memories
pin memories
search memories

Import UI should show:

processing stage
percentage
estimated remaining chunks
currently importing section
==================================================
PERFORMANCE OPTIMIZATION

Requirements:

minimize embedding generation cost
batch embedding requests
lazy-load old memories
cache recent memory retrieval
paginate memory dashboard
avoid large prompt contexts
==================================================
SECURITY

Requirements:

all memory isolated per user
secure export URLs
validate imports
sanitize uploaded files
prevent cross-user memory access
==================================================
DELIVERABLES

Generate:

Full Convex schema
Backend functions/actions
Memory retrieval pipeline
Import/export architecture
Background processing system
Type-safe utilities
Example frontend hooks
React components
Memory quota enforcement
Detailed folder structure
Scalability recommendations
Production-ready code
Comments explaining architecture decisions
Step-by-step setup instructions

Code must be:

scalable
modular
production-grade
optimized for AI workloads
strongly typed
clean architecture
easy to extend later

Use best practices for:

Convex
Next.js
TypeScript
AI memory systems
vector retrieval
SaaS architecture
background jobs
large-scale imports