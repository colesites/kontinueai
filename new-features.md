Build a production-grade Agents, Projects, Tasks, and Connectors system for Kontinue AI.

Tech Stack:

- Next.js
- TypeScript
- Convex
- Tailwind CSS
- OAuth Integrations

==================================================
GOAL
==================================================

Transform Kontinue AI from a chatbot into an AI Operating System.

The system must allow users to:

- Chat with AI
- Use specialized AI agents
- Manage projects
- Manage tasks
- Connect external services
- Share context between all systems
- Use memory across agents, projects, and tasks

All systems must work together.

Example:

User creates a project:
"Kontinue AI"

Inside the project:

- conversations
- memories
- tasks
- files
- notes

AI automatically understands that all related information belongs to that project.

==================================================
AGENTS SYSTEM
==================================================

Create a modular multi-agent architecture.

Agents:

1. Research Agent
2. Coding Agent
3. Marketing Agent
4. Personal Assistant

All agents share:

- user memory
- project memory
- tasks
- conversations

Agents do NOT have separate memory systems.

Each agent should have:

- id
- name
- icon
- description
- systemPrompt
- availableTools
- suggestedActions

==================================================
RESEARCH AGENT
==================================================

Capabilities:

- Deep research
- Web search
- Citations
- PDF analysis
- Report generation
- Fact checking

==================================================
CODING AGENT
==================================================

Capabilities:

- Code generation
- Debugging
- Architecture planning
- GitHub integration
- Code review
- Documentation

==================================================
MARKETING AGENT
==================================================

Capabilities:

- Content creation
- Branding
- Social media planning
- Campaign generation
- SEO writing
- Product launches

==================================================
PERSONAL ASSISTANT
==================================================

Capabilities:

- Scheduling
- Reminders
- Productivity
- Goal tracking
- Personal organization
- Follow-ups

==================================================
AGENT RECOMMENDATION SYSTEM
==================================================

AI should intelligently recommend agents.

Examples:

"This looks like a coding problem."

=> Suggest Coding Agent

"This requires web research."

=> Suggest Research Agent

"This sounds like a marketing campaign."

=> Suggest Marketing Agent

==================================================
PROJECTS SYSTEM
==================================================

Build a complete Projects system.

Projects should act as containers.

Examples:

Project:
Kontinue AI

Contains:

- chats
- memories
- tasks
- files
- notes
- milestones

Users can create unlimited projects based on plan limits.

==================================================
PROJECT TABLE
==================================================

projects

- id
- userId
- name
- description
- status
- icon
- color
- archived
- createdAt
- updatedAt

==================================================
PROJECT FEATURES
==================================================

Each project should support:

- AI conversations
- Project memory
- Task management
- Milestones
- Notes
- Progress tracking

AI should automatically understand project context.

Example:

User asks:

"What is left for Kontinue AI?"

AI should analyze:

- open tasks
- milestones
- notes
- project memories

and provide a status report.

==================================================
TASKS SYSTEM
==================================================

Build a complete AI-powered task management system.

Users can:

- Create tasks
- Create reminders
- Set deadlines
- Create recurring tasks
- Assign tasks to projects
- Link tasks to memories
- Link tasks to conversations

==================================================
TASK TABLE
==================================================

tasks

- id
- userId
- projectId
- title
- description
- dueDate
- priority
- status
- recurring
- recurrenceRule
- linkedConversationId
- linkedMemoryIds
- createdByAgent
- completedAt
- createdAt

==================================================
TASK FEATURES
==================================================

Support:

- Today
- Upcoming
- Overdue
- Completed

Views:

- List
- Kanban
- Calendar

==================================================
AI TASK CREATION
==================================================

AI should detect task intent automatically.

Examples:

"Remind me to deploy Friday."

=> Create task automatically

"Call investor tomorrow."

=> Create task automatically

"Finish landing page next week."

=> Create task automatically

Before creating:
Ask for confirmation if confidence is low.

==================================================
SMART TASKS
==================================================

AI should:

- Suggest deadlines
- Suggest subtasks
- Suggest priorities
- Detect blocked tasks
- Detect overdue tasks

Example:

Task:
Launch Kontinue AI

AI generates:

- Finish homepage
- Finish onboarding
- Test payments
- Deploy production build
- Marketing launch

==================================================
REMINDERS SYSTEM
==================================================

Support:

- Push notifications
- Email notifications
- In-app notifications

Reminder options:

- 5 minutes before
- 15 minutes before
- 1 hour before
- 1 day before
- Custom

==================================================
CONNECTORS SYSTEM
==================================================

Build an OAuth-based connectors platform.

Users can connect external services.

==================================================
INITIAL CONNECTORS
==================================================

1. Google Calendar
2. Gmail
3. GitHub
4. Notion
5. Google Drive
6. Todoist

Architecture must support future connectors.

==================================================
CONNECTOR TABLE
==================================================

connectors

- id
- userId
- provider
- accessTokenEncrypted
- refreshTokenEncrypted
- scopes
- connected
- lastSyncAt
- createdAt

==================================================
GOOGLE CALENDAR CONNECTOR
==================================================

Capabilities:

- Read calendar
- Create events
- Update events
- Delete events

AI can:

- Schedule meetings
- Create reminders
- Check availability

==================================================
GMAIL CONNECTOR
==================================================

Capabilities:

- Read emails
- Search emails
- Draft emails
- Send emails

AI can:

- Summarize inbox
- Draft responses
- Detect important messages

==================================================
GITHUB CONNECTOR
==================================================

Capabilities:

- Read repositories
- Read issues
- Read pull requests
- Read commits

AI can:

- Analyze repositories
- Summarize issues
- Review project progress

==================================================
NOTION CONNECTOR
==================================================

Capabilities:

- Read pages
- Create pages
- Update pages

AI can:

- Organize notes
- Generate documentation
- Sync project knowledge

==================================================
TODOIST CONNECTOR
==================================================

Capabilities:

- Create tasks
- Update tasks
- Sync tasks

AI can:

- Mirror Kontinue tasks
- Import existing tasks
- Keep both systems synchronized

==================================================
SMART CONNECTOR MEMORY
==================================================

Do NOT store raw connector data permanently.

Instead:

Extract:

- deadlines
- projects
- important contacts
- meetings
- commitments

Store only useful information inside memory.

==================================================
BACKGROUND JOBS
==================================================

Use Convex scheduled jobs for:

- reminders
- task notifications
- connector syncing
- project summaries
- AI recommendations

==================================================
UI STRUCTURE
==================================================

Sidebar:

- Chats
- Projects
- Tasks
- Agents
- Connectors
- Memory
- Canvas
- Settings

==================================================
DELIVERABLES
==================================================

Generate:

1. Full Convex schema
2. Folder structure
3. Database models
4. OAuth implementation
5. Agent architecture
6. Projects architecture
7. Tasks architecture
8. Connectors architecture
9. React hooks
10. UI pages
11. API routes
12. Scheduled jobs
13. Security best practices
14. Type-safe TypeScript code
15. Production-ready implementation

The architecture must be scalable, modular, maintainable, and designed for millions of users.
