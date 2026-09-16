# JARVIS Command Center

Personal operator dashboard: missions, memory, and a streaming AI core with generative UI. Built with Next.js, Firebase, NextAuth, and Thesys C1.

## What JARVIS can do now

Talk in the **Talk to JARVIS** bar (or use Quick Commands / sidebar prompts). With a Thesys API key, replies stream in and can render as cards, lists, and timelines instead of a wall of text. Without the key, JARVIS still answers locally with a briefing or recalled notes.

### Missions (tasks)

- Create a mission with a title, due date, priority, tags, and notes
- List active work, or filter by open / in progress / done
- Mark a mission complete (by id or title)
- Reschedule a due date
- Get today’s executive briefing: overdue work, due today, and in progress

The HUD also shows system status, a live intelligence feed (overdue / due soon), and a mission timeline.

### Memory

- Store a short note JARVIS should remember
- Recall stored notes (optionally by search)

Header search asks JARVIS to look across missions and memory.

### Conversations

- Chat history is saved per operator
- Reopen past threads from Conversations, or start a new one

### Auth and data

- Sign in with Firebase email/password, or use **demo operator** in development
- Data lives in Firestore when the Admin SDK is configured
- Without Admin SDK, demo login uses a local `.data` store so you can explore the UI
- Demo login seeds sample missions and a memory note

### Google Calendar and Gmail

After you click **Connect Google** in the header, JARVIS can:

- Create calendar events and reminders
- List upcoming Google Calendar events
- List and read Gmail
- Send email, including images pasted or attached in the Talk bar

### HUD shortcuts that already work

- **Tasks** — list active missions
- **Calendar** — Google Calendar plus mission timeline
- **Memory** — recall stored notes
- **Start New Task** / **Open Calendar** / **Run Workflow** / **Executive Briefing**
- Sign out

## Not live yet

These modules are in the UI but not wired:

- Voice / speech (Talk bar mic, Start Voice Chat)
- AI Core, Agents, Knowledge Base, Tools & Skills, Workflows as standalone pages
- Host CPU / RAM / disk monitor
- Focus mode