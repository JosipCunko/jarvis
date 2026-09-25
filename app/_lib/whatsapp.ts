import "server-only";
import fs from "fs/promises";
import path from "path";
import QRCode from "qrcode";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  toNumber,
  useMultiFileAuthState as loadMultiFileAuthState,
  type Contact,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import type { ChatAttachment } from "@/app/_types/jarvis";

const NOT_LINKED = "WhatsApp is not linked. Connect it in Link status.";
const MAX_MESSAGES = 400;
const MAX_RAW_IMAGES = 40;
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;

const silentLogger = {
  level: "silent",
  child() {
    return silentLogger;
  },
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export type WhatsAppStatus = {
  connected: boolean;
  phone: string | null;
  qr: string | null;
  linked: boolean;
  error: string | null;
};

type CachedChat = {
  id: string;
  name: string;
  unread: number;
  archived: boolean;
};

type CachedContact = {
  id: string;
  name: string;
  phone: string;
};

type CachedMessage = {
  id: string;
  chatId: string;
  sender: string;
  text: string;
  timestamp: number;
  fromMe: boolean;
  hasImage: boolean;
  mimeType: string;
};

type Session = {
  userId: string;
  generation: number;
  sock: WASocket | null;
  starting: Promise<void> | null;
  stopped: boolean;
  connected: boolean;
  phone: string | null;
  qr: string | null;
  qrRaw: string | null;
  error: string | null;
  retries: number;
  historyReady: boolean;
  chats: Map<string, CachedChat>;
  contacts: Map<string, CachedContact>;
  messages: Map<string, CachedMessage>;
  rawImages: Map<string, WAMessage>;
};

type LooseMessage = {
  conversation?: string | null;
  extendedTextMessage?: { text?: string | null } | null;
  imageMessage?: { caption?: string | null; mimetype?: string | null } | null;
  videoMessage?: { caption?: string | null } | null;
  ephemeralMessage?: { message?: LooseMessage | null } | null;
  viewOnceMessage?: { message?: LooseMessage | null } | null;
  viewOnceMessageV2?: { message?: LooseMessage | null } | null;
  documentWithCaptionMessage?: { message?: LooseMessage | null } | null;
};

const globalStore = globalThis as typeof globalThis & {
  __jarvisWhatsApp?: Map<string, Session>;
};

function sessions() {
  if (!globalStore.__jarvisWhatsApp) globalStore.__jarvisWhatsApp = new Map();
  return globalStore.__jarvisWhatsApp;
}

function sessionDir(userId: string) {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "operator";
  return path.join(process.cwd(), ".data", "whatsapp", safe);
}

function sessionFor(userId: string) {
  const existing = sessions().get(userId);
  if (existing) return existing;
  const session: Session = {
    userId,
    generation: 0,
    sock: null,
    starting: null,
    stopped: false,
    connected: false,
    phone: null,
    qr: null,
    qrRaw: null,
    error: null,
    retries: 0,
    historyReady: false,
    chats: new Map(),
    contacts: new Map(),
    messages: new Map(),
    rawImages: new Map(),
  };
  sessions().set(userId, session);
  return session;
}

async function hasCreds(userId: string) {
  try {
    await fs.access(path.join(sessionDir(userId), "creds.json"));
    return true;
  } catch {
    return false;
  }
}

function waitUntil(check: () => boolean, ms: number) {
  const start = Date.now();
  return new Promise<void>((resolve) => {
    const tick = () => {
      if (check() || Date.now() - start >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

function disconnectCode(error: unknown) {
  if (!error || typeof error !== "object" || !("output" in error)) return undefined;
  const output = (error as { output?: { statusCode?: number } }).output;
  return output?.statusCode;
}

function phoneDigits(jid: string | null | undefined) {
  if (!jid) return "";
  const user = jidNormalizedUser(jid).split("@")[0] || "";
  return user.replace(/\D/g, "");
}

function phoneLabel(jid: string | null | undefined) {
  const digits = phoneDigits(jid);
  return digits ? `+${digits}` : "";
}

function unwrapMessage(message: LooseMessage | null | undefined): LooseMessage | null {
  if (!message) return null;
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.documentWithCaptionMessage?.message ||
    message
  );
}

function describeMessage(message: WAMessage) {
  const inner = unwrapMessage(message.message as LooseMessage | null | undefined);
  const image = inner?.imageMessage;
  const text =
    inner?.conversation ||
    inner?.extendedTextMessage?.text ||
    image?.caption ||
    inner?.videoMessage?.caption ||
    "";
  return {
    text: (text || (image ? "[image]" : "")).trim(),
    hasImage: Boolean(image),
    mimeType: image?.mimetype || "image/jpeg",
  };
}

function nameFor(session: Session, jid: string) {
  const contact =
    session.contacts.get(jid) || session.contacts.get(jidNormalizedUser(jid));
  if (contact?.name) return contact.name;
  const chat = session.chats.get(jid);
  if (chat?.name) return chat.name;
  return phoneLabel(jid) || jid;
}

function rememberContact(session: Session, contact: Partial<Contact>) {
  if (!contact.id) return;
  const prev = session.contacts.get(contact.id);
  const name = contact.name || contact.notify || contact.verifiedName || prev?.name || "";
  const phone = phoneDigits(contact.phoneNumber || contact.id) || prev?.phone || "";
  const next = { id: contact.id, name, phone };
  session.contacts.set(contact.id, next);
  if (contact.phoneNumber) session.contacts.set(contact.phoneNumber, next);
}

function rememberChat(
  session: Session,
  chat: {
    id?: string | null;
    name?: string | null;
    unreadCount?: number | null;
    archived?: boolean | null;
  },
) {
  if (!chat.id || chat.id === "status@broadcast") return;
  const prev = session.chats.get(chat.id);
  const name = chat.name || prev?.name || nameFor(session, chat.id);
  session.chats.set(chat.id, {
    id: chat.id,
    name,
    unread: typeof chat.unreadCount === "number" ? chat.unreadCount : (prev?.unread ?? 0),
    archived: typeof chat.archived === "boolean" ? chat.archived : (prev?.archived ?? false),
  });
}

function rememberMessage(session: Session, message: WAMessage) {
  const id = message.key?.id;
  const chatId = message.key?.remoteJid;
  if (!id || !chatId || chatId === "status@broadcast") return;
  const body = describeMessage(message);
  session.messages.set(id, {
    id,
    chatId,
    sender: message.key.fromMe ? "You" : message.pushName || nameFor(session, chatId),
    text: body.text,
    timestamp: toNumber(message.messageTimestamp),
    fromMe: Boolean(message.key.fromMe),
    hasImage: body.hasImage,
    mimeType: body.mimeType,
  });
  if (body.hasImage) session.rawImages.set(id, message);
  if (session.messages.size > MAX_MESSAGES) {
    const oldest = [...session.messages.values()].sort((a, b) => a.timestamp - b.timestamp)[0];
    if (oldest) {
      session.messages.delete(oldest.id);
      session.rawImages.delete(oldest.id);
    }
  }
  while (session.rawImages.size > MAX_RAW_IMAGES) {
    const first = session.rawImages.keys().next().value;
    if (!first) break;
    session.rawImages.delete(first);
  }
}

function clearCache(session: Session) {
  session.chats.clear();
  session.contacts.clear();
  session.messages.clear();
  session.rawImages.clear();
  session.historyReady = false;
}

async function snapshot(session: Session): Promise<WhatsAppStatus> {
  const linked = session.connected || (await hasCreds(session.userId));
  return {
    connected: session.connected,
    phone: session.phone,
    qr: session.connected ? null : session.qr,
    linked,
    error: session.connected ? null : session.error,
  };
}

async function startSocket(session: Session) {
  const generation = ++session.generation;
  try {
    await fs.mkdir(sessionDir(session.userId), { recursive: true });
    const { state, saveCreds } = await loadMultiFileAuthState(sessionDir(session.userId));
    const { version } = await fetchLatestBaileysVersion();
    if (session.generation !== generation || session.stopped) return;
    const sock = makeWASocket({
      version,
      auth: state,
      logger: silentLogger as never,
      browser: Browsers.appropriate("JARVIS"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      qrTimeout: 60_000,
    });
    if (session.generation !== generation || session.stopped) {
      await sock.end(undefined);
      return;
    }
    session.sock = sock;
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (update) => {
      if (session.generation !== generation) return;
      if (update.qr) {
        session.qrRaw = update.qr;
        void QRCode.toDataURL(update.qr, { margin: 1, width: 280 }).then((url) => {
          if (session.qrRaw === update.qr && !session.connected) session.qr = url;
        });
      }
      if (update.connection === "open") {
        session.connected = true;
        session.qr = null;
        session.qrRaw = null;
        session.error = null;
        session.retries = 0;
        session.phone = phoneLabel(sock.user?.phoneNumber || sock.user?.id) || session.phone;
        if (session.chats.size > 0) session.historyReady = true;
      }
      if (update.connection !== "close") return;
      session.connected = false;
      session.phone = null;
      session.sock = null;
      const code = disconnectCode(update.lastDisconnect?.error);
      if (session.stopped || session.generation !== generation) return;
      if (code === DisconnectReason.loggedOut) {
        session.qr = null;
        session.error = "WhatsApp was logged out. Connect again.";
        clearCache(session);
        void fs.rm(sessionDir(session.userId), { recursive: true, force: true });
        return;
      }
      if (code === DisconnectReason.forbidden || code === DisconnectReason.connectionReplaced) {
        session.error = "WhatsApp refused this session. Connect again.";
        return;
      }
      if (code !== DisconnectReason.restartRequired) session.retries += 1;
      if (session.retries > 4) {
        session.error = "WhatsApp disconnected.";
        return;
      }
      setTimeout(() => {
        if (!session.stopped) void ensureSocket(session);
      }, code === DisconnectReason.restartRequired ? 250 : 1500);
    });
    sock.ev.on("messaging-history.set", ({ chats, contacts, messages }) => {
      if (session.generation !== generation) return;
      for (const contact of contacts) rememberContact(session, contact);
      for (const chat of chats) rememberChat(session, chat);
      for (const message of messages) rememberMessage(session, message);
      session.historyReady = true;
    });
    sock.ev.on("chats.upsert", (chats) => {
      if (session.generation !== generation) return;
      for (const chat of chats) rememberChat(session, chat);
    });
    sock.ev.on("chats.update", (chats) => {
      if (session.generation !== generation) return;
      for (const chat of chats) rememberChat(session, chat);
    });
    sock.ev.on("chats.delete", (ids) => {
      if (session.generation !== generation) return;
      for (const id of ids) session.chats.delete(id);
    });
    sock.ev.on("contacts.upsert", (contacts) => {
      if (session.generation !== generation) return;
      for (const contact of contacts) rememberContact(session, contact);
    });
    sock.ev.on("contacts.update", (contacts) => {
      if (session.generation !== generation) return;
      for (const contact of contacts) rememberContact(session, contact);
    });
    sock.ev.on("messages.upsert", ({ messages }) => {
      if (session.generation !== generation) return;
      for (const message of messages) rememberMessage(session, message);
    });
  } catch (error) {
    if (session.generation !== generation) return;
    session.sock = null;
    session.connected = false;
    session.error = error instanceof Error ? error.message : "Could not start WhatsApp.";
  }
}

async function ensureSocket(session: Session) {
  if (session.stopped || session.sock) return;
  if (session.starting) {
    await session.starting;
    return;
  }
  session.starting = startSocket(session).finally(() => {
    session.starting = null;
  });
  await session.starting;
}

export async function getWhatsAppStatus(userId: string, waitMs = 0) {
  const session = sessionFor(userId);
  if (session.connected) return snapshot(session);
  const creds = await hasCreds(userId);
  const pairing = Boolean(session.sock || session.starting || session.qr);
  if (!creds && !pairing) return snapshot(session);
  if (!session.stopped) await ensureSocket(session);
  if (waitMs > 0 && !session.connected) {
    await waitUntil(
      () => session.connected || Boolean(session.qr) || Boolean(session.error),
      waitMs,
    );
  }
  return snapshot(session);
}

export async function connectWhatsApp(userId: string) {
  const session = sessionFor(userId);
  session.stopped = false;
  session.error = null;
  session.retries = 0;
  if (!session.connected && !session.sock) {
    await ensureSocket(session);
  }
  await waitUntil(() => session.connected || Boolean(session.qr) || Boolean(session.error), 15_000);
  return snapshot(session);
}

export async function disconnectWhatsApp(userId: string) {
  const session = sessionFor(userId);
  session.stopped = true;
  session.generation += 1;
  session.connected = false;
  session.phone = null;
  session.qr = null;
  session.qrRaw = null;
  session.error = null;
  const sock = session.sock;
  session.sock = null;
  clearCache(session);
  try {
    await sock?.logout("JARVIS disconnect");
  } catch {
    try {
      await sock?.end(undefined);
    } catch {
      // The socket is already gone.
    }
  }
  await fs.rm(sessionDir(userId), { recursive: true, force: true });
  return snapshot(session);
}

async function requireSession(userId: string) {
  const status = await getWhatsAppStatus(userId, 12_000);
  const session = sessionFor(userId);
  if (!status.connected || !session.sock) {
    throw new Error(status.error || NOT_LINKED);
  }
  await waitUntil(
    () => session.historyReady || session.messages.size > 0 || session.contacts.size > 0,
    2500,
  );
  return session;
}

function uniqueContacts(session: Session) {
  const seen = new Set<string>();
  const rows: CachedContact[] = [];
  for (const contact of session.contacts.values()) {
    if (seen.has(contact.id)) continue;
    seen.add(contact.id);
    rows.push(contact);
  }
  for (const chat of session.chats.values()) {
    if (chat.id.endsWith("@g.us") || seen.has(chat.id)) continue;
    seen.add(chat.id);
    rows.push({
      id: chat.id,
      name: chat.name,
      phone: phoneDigits(chat.id),
    });
  }
  return rows;
}

function matchesQuery(row: CachedContact, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  const name = row.name.toLowerCase();
  if (name && name === q) return true;
  if (q.length >= 2 && name.includes(q)) return true;
  if (digits.length >= 4 && row.phone.includes(digits)) return true;
  return false;
}

function findContacts(session: Session, query: string) {
  return uniqueContacts(session).filter((row) => matchesQuery(row, query));
}

function pickRecipient(session: Session, to: string) {
  const query = to.trim();
  const matches = findContacts(session, query);
  const q = query.toLowerCase();
  const digits = q.replace(/\D/g, "");
  const exactName = matches.filter((row) => row.name.toLowerCase() === q);
  if (exactName.length === 1) return exactName[0];
  const exactPhone = matches.filter((row) => digits && row.phone === digits);
  if (exactPhone.length === 1) return exactPhone[0];
  if (matches.length === 1) return matches[0];
  if (matches.length === 0 && digits.length >= 8) {
    return { id: `${digits}@s.whatsapp.net`, name: `+${digits}`, phone: digits };
  }
  if (matches.length === 0) throw new Error(`No WhatsApp contact matches "${to}".`);
  const names = matches
    .slice(0, 5)
    .map((row) => row.name || `+${row.phone}`)
    .join(", ");
  throw new Error(`Several WhatsApp contacts match "${to}": ${names}.`);
}

function publicMessage(session: Session, message: CachedMessage) {
  const chat = session.chats.get(message.chatId);
  return {
    id: message.id,
    chat: chat?.name || nameFor(session, message.chatId),
    sender: message.sender,
    text: message.text,
    time: message.timestamp ? new Date(message.timestamp * 1000).toISOString() : "",
    fromMe: message.fromMe,
    hasImage: message.hasImage,
  };
}

async function imageFor(session: Session, message: CachedMessage) {
  const raw = session.rawImages.get(message.id);
  const sock = session.sock;
  if (!raw || !sock) return null;
  try {
    const buffer = await downloadMediaMessage(raw, "buffer", {}, {
      logger: silentLogger as never,
      reuploadRequest: (item) => sock.updateMediaMessage(item),
    });
    if (buffer.length > MAX_IMAGE_BYTES) return null;
    return {
      name: `${message.sender || "whatsapp"}.jpg`,
      dataUrl: `data:${message.mimeType};base64,${buffer.toString("base64")}`,
    };
  } catch {
    return null;
  }
}

export async function readWhatsAppMessages(
  userId: string,
  input: {
    contact?: string;
    unread_only?: boolean;
    message_id?: string;
    max_results?: number;
  },
) {
  const session = await requireSession(userId);
  const limit = Math.min(Math.max(input.max_results ?? 12, 1), 30);
  let selected: CachedMessage[] = [];
  if (input.message_id) {
    const found = session.messages.get(input.message_id);
    if (!found) throw new Error("No WhatsApp message with that id.");
    selected = [found];
  } else if (input.unread_only) {
    for (const chat of session.chats.values()) {
      if (chat.archived || chat.unread <= 0) continue;
      const recent = [...session.messages.values()]
        .filter((message) => message.chatId === chat.id && !message.fromMe)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, chat.unread);
      selected.push(...recent);
    }
    selected.sort((a, b) => b.timestamp - a.timestamp);
  } else {
    selected = [...session.messages.values()].sort((a, b) => b.timestamp - a.timestamp);
  }
  if (input.contact && !input.message_id) {
    const chats = new Set(findContacts(session, input.contact).map((row) => row.id));
    const named = [...session.chats.values()].filter((chat) =>
      matchesQuery({ id: chat.id, name: chat.name, phone: phoneDigits(chat.id) }, input.contact || ""),
    );
    for (const chat of named) chats.add(chat.id);
    if (chats.size === 0) throw new Error(`No WhatsApp chat matches "${input.contact}".`);
    selected = selected.filter((message) => chats.has(message.chatId));
  }
  const messages = selected.slice(0, limit).map((message) => publicMessage(session, message));
  const images = [];
  for (const message of selected.slice(0, limit)) {
    if (!message.hasImage || images.length >= 3) continue;
    const image = await imageFor(session, message);
    if (image) images.push(image);
  }
  return {
    count: messages.length,
    unread: [...session.chats.values()].reduce(
      (sum, chat) => sum + (chat.archived ? 0 : Math.max(chat.unread, 0)),
      0,
    ),
    messages,
    ...(images.length ? { images } : {}),
  };
}

export async function readWhatsAppContacts(userId: string, query?: string) {
  const session = await requireSession(userId);
  const contacts = findContacts(session, query || "")
    .filter((row) => row.name || row.phone)
    .slice(0, 20)
    .map((row) => ({
      name: row.name || `+${row.phone}`,
      phone: row.phone ? `+${row.phone}` : "",
    }));
  return { count: contacts.length, contacts };
}

function operatorSpecifiedCaption(operatorText: string, caption: string) {
  const source = operatorText.trim();
  if (!source) return false;
  const wanted = caption.trim().toLowerCase();
  const sourceLower = source.toLowerCase();
  const instructionWord = /^(image|picture|photo|pic|slika|sliku|slike|send|pošalji|posalji)$/i;
  if (
    wanted.length >= 2 &&
    wanted !== sourceLower &&
    !wanted.includes(sourceLower) &&
    sourceLower.includes(wanted) &&
    !instructionWord.test(wanted)
  ) {
    return true;
  }
  return /\b(say|saying|tell|write|caption|napiši|napisi|reci|kaži|kazi|poruka|uz tekst|with the (?:text|words|caption|message))\b/i.test(
    source,
  );
}

function attachmentFile(item: ChatAttachment) {
  const dataUrl = item.dataUrl || "";
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[2]) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
  return { name: item.name || "image.jpg", buffer };
}

export async function sendWhatsAppMessage(
  userId: string,
  input: { to?: string; text?: string; attach_chat_images?: boolean },
  attachments: ChatAttachment[] = [],
  operatorText = "",
) {
  const session = await requireSession(userId);
  const sock = session.sock;
  if (!sock) throw new Error(NOT_LINKED);
  const to = input.to?.trim() || "";
  if (!to) throw new Error("Say which contact to message.");
  const recipient = pickRecipient(session, to);
  let jid = recipient.id;
  if (jid.endsWith("@s.whatsapp.net")) {
    const looked = await sock.onWhatsApp(recipient.phone || phoneDigits(jid));
    const hit = looked?.find((item) => item.exists);
    if (!hit) throw new Error("That number is not on WhatsApp.");
    jid = hit.jid;
  }
  const files =
    input.attach_chat_images === false
      ? []
      : attachments.flatMap((item) => {
          const file = attachmentFile(item);
          return file ? [file] : [];
        });
  const requested = input.text?.trim() || "";
  const text =
    files.length > 0 && !operatorSpecifiedCaption(operatorText, requested) ? "" : requested;
  if (!text && files.length === 0) throw new Error("Write a message or attach an image.");
  if (files.length === 0) {
    await sock.sendMessage(jid, { text });
  } else {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      await sock.sendMessage(jid, {
        image: file.buffer,
        ...(index === 0 && text ? { caption: text } : {}),
      });
    }
  }
  return {
    ok: true,
    to: recipient.name || (recipient.phone ? `+${recipient.phone}` : to),
    attached: files.map((file) => file.name),
  };
}

export async function countUnreadWhatsApp(userId: string) {
  const status = await getWhatsAppStatus(userId, 8_000);
  if (!status.connected) {
    return {
      connected: false,
      unread: null as number | null,
      error: status.linked ? status.error || "WhatsApp session is down." : null,
    };
  }
  const session = sessionFor(userId);
  await waitUntil(() => session.historyReady, 3_000);
  const unread = [...session.chats.values()].reduce(
    (sum, chat) => sum + (chat.archived || chat.unread < 0 ? 0 : chat.unread),
    0,
  );
  return { connected: true, unread, error: null as string | null };
}
