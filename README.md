![dashboard](./dashboard.png)

# JARVIS Command Center

Personal operator dashboard: missions, memory, and a streaming AI core with generative UI. Built with Next.js, Firebase, NextAuth, and Thesys C1.

## What JARVIS can do now

Talk in the **Talk to JARVIS** bar (or use Quick Commands / sidebar prompts). With a Thesys API key, replies stream in and can render as cards, lists, and timelines instead of a wall of text. Without the key, JARVIS still answers locally with a briefing or recalled notes.

### Missions (tasks)

A mission is a task stored for the signed-in operator. A Firebase account and the demo operator do not share missions, so work created on one does not appear on the other.

- **Tasks** in the sidebar opens the mission board: pending and completed, with search and Start / Complete / Reopen.
- The command center **mission timeline** is the same list, trimmed to active work plus a few completed ones. **Board** on that panel opens Tasks.
- JARVIS picks an icon and color from `app/_lib/task-appearance.ts` when he creates one. You can also ask him to complete or reschedule a mission by name.

The HUD also shows system status and a live intelligence feed of overdue and due-soon missions.

### Memory

- Open **Memory** in the sidebar to browse every stored note
- Add a note, search the list, or delete one
- Ask JARVIS to recall notes from that view, or tell him to remember something in the Talk bar

Header search asks JARVIS to look across missions and memory.

### Auth and data

- Sign in with Firebase email/password, or use **demo operator** in development
- Data lives in Firestore when the Admin SDK is configured
- Without Admin SDK, demo login uses a local `.data` store so you can explore the UI
- Demo login seeds sample missions and a memory note

### Google Calendar and Gmail

After you click **Connect Google** in Link status, JARVIS can:

- Create calendar events and reminders
- List upcoming Google Calendar events
- List and read Gmail
- Send email, including images pasted or attached in the Talk bar

### Voice

The talk-bar mic and **Start Voice Chat** keep listening through pauses shorter than about two seconds. **Tap to Speak** stops after 4 seconds if you say nothing, and JARVIS is not prompted. With `OPENROUTER_API_KEY` (used first) or `OPENAI_API_KEY`, JARVIS transcribes Croatian or English automatically, speaks the reply in that language, and turns a spoken day plan such as "danas moram ići u teretanu i obaviti dućan" into separate missions. Without either key, the browser recognizer is used in Croatian or English based on the browser language.

The sidebar bars follow your voice only when one of those keys is set. That path opens the microphone and reads its level. Without a key, the browser recognizer returns text and no volume, so the bars play a fixed wobble whether you are talking or silent. Speech recognition still hears you either way.

## Not live yet

- AI Core, Agents, Knowledge Base, Tools & Skills, Workflows as standalone pages
- Host CPU / RAM / disk monitor

## How memory and tool calling work

A memory is a short note you save on purpose. It is not pasted into every prompt.

Each note is `{ id, userId, text, createdAt }`. Notes live with the rest of your data:

- Firestore: `users/{userId}/memories/{id}` when the Admin SDK is configured
- Otherwise: `.data/jarvis-memory.json`

Two paths write the same record:

- The **Memory** tab calls `POST /api/memories`
- Saying "remember this" in the Talk bar makes the model call the `remember` tool, which runs the same store method

### What a chat turn actually sends

Every Talk-bar turn sends three things to Thesys:

1. A fixed system prompt. It says missions, memories, Calendar, and Gmail live in tools, and that JARVIS should call those tools instead of inventing data. It does not contain your notes.
2. The messages in the current conversation only.
3. Tool definitions (`remember`, `recall`, mission tools, Calendar, Gmail) with `tool_choice: auto`.

Notes are loaded only if the model chooses to call `recall` on that turn. `recall` returns at most 8 notes, newest first. With a search string it keeps notes whose text contains that string. Those results are appended to that same turn as tool messages, and JARVIS answers from them. The next message does not include them again unless the model calls `recall` again.

Opening **Memory** does not go through the model. That view reads the store directly, so it can show every note, not just the 8 the tool returns.

Saved conversations are separate. A thread is the chat transcript (`users/{userId}/chats`), not these notes. Starting a new conversation does not carry memory notes into the prompt.

# Speech recognition
The Web Speech API is the fallback, and it lives in app/_lib/use-speech-recognition.ts. It uses window.SpeechRecognition or window.webkitSpeechRecognition, which is Chrome and Edge’s browser recognizer. That path runs only when neither OPENROUTER_API_KEY nor OPENAI_API_KEY is loaded. With the OpenRouter key loaded, Tap to Speak never calls it. The browser records audio with MediaRecorder, sends it to /api/speech/transcribe, and OpenRouter transcribes it. The sidebar bars read that same microphone stream.


Spoken replies now use OpenRouter's Grok voice model, with the voice Rex, and the audio comes back as an MP3.

### Why the voice and the card do not match

The card and the spoken reply are the same Thesys reply, not two answers. The screen renders the full card, including titles and bullets. Voice reads the explanation.

`speakableReply` in `app/_lib/c1.ts` keeps the lead-in prose, every sentence in `Text`, and `ListItem` facts such as a mission name and its due date. It drops `CardHeader` titles and subtitles, bullet marks, and props such as icon and color. List items are joined with a pause, so a mission list is heard as "Teretana. Due 22 September." A long reply is cut at a sentence boundary near 4000 characters. That string goes to `/api/speech/speak`. OpenRouter reads it with Grok voice (Rex). An OpenAI key uses `gpt-4o-mini-tts` (Onyx) instead. The speech model does not write its own reply.

A card can still show a title like Communication Error while JARVIS speaks the paragraph under it, and keeps going when the explanation is more than one sentence.