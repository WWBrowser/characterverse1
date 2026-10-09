import { createFileRoute } from '@tanstack/react-router'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { characters, cmailAdoptions, cmailMessages, cmailThreads } from '../../db/schema.js'
import { inFolder, type Adopted, type FolderId, type ThreadSummary } from '../lib/cmail.js'

// CMail — the mailbox.
//
//   GET  ?sessionId&folder&character&q   the folder's threads, every folder's
//                                        count, and the adopted roster
//   POST { action: 'adopt' }    adopt a character into the mailbox; it writes
//                               first, with its own greeting
//   POST { action: 'release' }  let a character go (its threads stay)
//   POST { action: 'send' }     send mail; the character writes back in character
//   POST { action: 'draft' }    save the one draft a thread may hold
//   POST { action: 'assist' }   write a draft *as* an adopted character — the
//                               /ask style of adoption, carried into compose
//
// Every request names its session, and every row is checked against it. A
// thread id from someone else's mailbox is a 404, not a read.

const MODEL = 'claude-haiku-4-5'

const CHAR = {
  id: characters.id,
  name: characters.name,
  avatar: characters.avatar,
  tagline: characters.tagline,
  category: characters.category,
  persona: characters.persona,
  description: characters.description,
  greeting: characters.greeting,
}

type Character = { id: number; name: string; avatar: string; tagline: string; category: string; persona: string; description: string; greeting: string }

const FOLDER_IDS: FolderId[] = ['inbox', 'starred', 'snoozed', 'important', 'sent', 'drafts', 'all', 'trash']

function readSession(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, 120) : ''
}

function clip(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : ''
}

/* ---------------------------------------------------------------- the model */

async function ask(system: string, messages: { role: 'user' | 'assistant'; content: string }[], maxTokens = 700): Promise<string> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!baseUrl || !apiKey) return ''
  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return Array.isArray(data?.content) ? data.content.map((b: any) => b?.text || '').join('').trim() : ''
  } catch {
    return ''
  }
}

function voiceOf(c: Character): string {
  return `You are ${c.name}${c.tagline ? ` — ${c.tagline}` : ''}.

${c.persona}
${c.description ? `\nBackground: ${c.description}` : ''}`
}

/** The character, writing mail back. In character, and shaped like a letter rather than a chat turn. */
function replySystem(c: Character): string {
  return `${voiceOf(c)}

You are corresponding by email through CharacterMail (CMail). Someone adopted you into their mailbox, and you are writing back to them.

Write ONLY the body of your email reply:
- stay completely in character as ${c.name}, in your own voice
- open with a greeting line, answer what they actually wrote, and sign off with your name
- a letter, not a chat message: a few short paragraphs, under 220 words
- no subject line, no headers, no quoting their mail back`
}

/** Ghost-writing as an adopted character — the /ask embodiment, aimed at a draft. */
function assistSystem(voice: Character, to: string): string {
  return `${voiceOf(voice)}

Someone has carried you into their CMail compose window to write an email in your voice. They will give you their notes. Turn them into the body of an email to ${to || 'the recipient'}, written as ${voice.name} would write it.

Rules:
- keep their meaning; you supply the voice, not new facts or promises
- write ONLY the email body: a greeting, the message, a sign-off
- under 200 words`
}

/* ---------------------------------------------------------------- helpers */

async function adoptedRoster(sessionId: string): Promise<Adopted[]> {
  const rows = await db
    .select({ id: characters.id, name: characters.name, avatar: characters.avatar, tagline: characters.tagline, category: characters.category, via: cmailAdoptions.via })
    .from(cmailAdoptions)
    .innerJoin(characters, eq(cmailAdoptions.characterId, characters.id))
    .where(eq(cmailAdoptions.sessionId, sessionId))
    .orderBy(asc(cmailAdoptions.createdAt))
  return rows
}

async function ownThread(sessionId: string, threadId: number) {
  const [t] = await db
    .select()
    .from(cmailThreads)
    .where(and(eq(cmailThreads.id, threadId), eq(cmailThreads.sessionId, sessionId)))
    .limit(1)
  return t ?? null
}

async function character(id: number): Promise<Character | null> {
  const [c] = await db.select(CHAR).from(characters).where(eq(characters.id, id)).limit(1)
  return c ?? null
}

/** Adopt, idempotently. Returns true when the adoption is new. */
async function adopt(sessionId: string, characterId: number, via: string): Promise<boolean> {
  const rows = await db
    .insert(cmailAdoptions)
    .values({ sessionId, characterId, via })
    .onConflictDoNothing()
    .returning({ id: cmailAdoptions.id })
  return rows.length > 0
}

/** The thread's turns, oldest first, as the model's conversation. */
async function history(threadId: number, subject: string) {
  const msgs = await db
    .select({ author: cmailMessages.author, body: cmailMessages.body, status: cmailMessages.status })
    .from(cmailMessages)
    .where(eq(cmailMessages.threadId, threadId))
    .orderBy(asc(cmailMessages.createdAt), asc(cmailMessages.id))
  const turns: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of msgs) {
    if (m.status === 'draft') continue
    const role = m.author === 'me' ? 'user' : 'assistant'
    // The model wants alternating turns; consecutive mails from one side are one turn.
    const last = turns[turns.length - 1]
    if (last && last.role === role) last.content += `\n\n${m.body}`
    else turns.push({ role, content: m.body })
  }
  // A thread that opens with the character's greeting starts on an assistant turn.
  if (turns[0]?.role === 'assistant') turns.unshift({ role: 'user', content: '(You were adopted into my CMail.)' })
  if (turns[0]) turns[0].content = `Subject: ${subject}\n\n${turns[0].content}`
  return turns
}

/* ---------------------------------------------------------------- handlers */

export const Route = createFileRoute('/api/cmail')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = readSession(url.searchParams.get('sessionId'))
        if (!sessionId) return Response.json({ error: 'sessionId required' }, { status: 400 })
        const folder = (FOLDER_IDS as string[]).includes(url.searchParams.get('folder') || '') ? (url.searchParams.get('folder') as FolderId) : 'inbox'
        const only = parseInt(url.searchParams.get('character') || '')
        const q = clip(url.searchParams.get('q'), 120).toLowerCase()

        const [roster, threads] = await Promise.all([
          adoptedRoster(sessionId),
          db
            .select({
              id: cmailThreads.id,
              characterId: cmailThreads.characterId,
              subject: cmailThreads.subject,
              starred: cmailThreads.starred,
              important: cmailThreads.important,
              unread: cmailThreads.unread,
              archived: cmailThreads.archived,
              trashed: cmailThreads.trashed,
              snoozedUntil: cmailThreads.snoozedUntil,
              lastAt: cmailThreads.lastAt,
              name: characters.name,
              avatar: characters.avatar,
            })
            .from(cmailThreads)
            .innerJoin(characters, eq(cmailThreads.characterId, characters.id))
            .where(eq(cmailThreads.sessionId, sessionId))
            .orderBy(desc(cmailThreads.lastAt))
            .limit(500),
        ])

        const ids = threads.map((t) => t.id)
        const msgs = ids.length
          ? await db
              .select({ threadId: cmailMessages.threadId, author: cmailMessages.author, status: cmailMessages.status, body: cmailMessages.body })
              .from(cmailMessages)
              .where(inArray(cmailMessages.threadId, ids))
              .orderBy(asc(cmailMessages.createdAt), asc(cmailMessages.id))
          : []
        const byThread = new Map<number, typeof msgs>()
        for (const m of msgs) byThread.set(m.threadId, [...(byThread.get(m.threadId) || []), m])

        const now = Date.now()
        const all: ThreadSummary[] = threads.map((t) => {
          const ms = byThread.get(t.id) || []
          const real = ms.filter((m) => m.status !== 'draft')
          const last = real[real.length - 1] ?? ms[ms.length - 1]
          return {
            id: t.id,
            characterId: t.characterId,
            name: t.name,
            avatar: t.avatar,
            subject: t.subject,
            snippet: (last?.body || '').replace(/\s+/g, ' ').slice(0, 160),
            lastAt: t.lastAt ? t.lastAt.toISOString() : null,
            lastAuthor: last?.author === 'character' ? 'character' : 'me',
            messageCount: real.length,
            starred: t.starred,
            important: t.important,
            unread: t.unread,
            archived: t.archived,
            trashed: t.trashed,
            snoozedUntil: t.snoozedUntil ? t.snoozedUntil.toISOString() : null,
            hasReceived: ms.some((m) => m.status === 'received'),
            hasSent: ms.some((m) => m.status === 'sent'),
            hasDraft: ms.some((m) => m.status === 'draft'),
          }
        })

        // Counts read the way Gmail's do: unread for Inbox, totals for the rest.
        const counts: Record<string, number> = {}
        for (const f of FOLDER_IDS) {
          const inF = all.filter((t) => inFolder(t, f, now))
          counts[f] = f === 'inbox' ? inF.filter((t) => t.unread).length : inF.length
        }
        const byCharacter: Record<number, number> = {}
        for (const t of all) if (!t.trashed && t.unread) byCharacter[t.characterId] = (byCharacter[t.characterId] || 0) + 1

        const shown = all.filter(
          (t) =>
            (Number.isFinite(only) ? t.characterId === only && !t.trashed : inFolder(t, folder, now)) &&
            (!q || `${t.name} ${t.subject} ${t.snippet}`.toLowerCase().includes(q)),
        )

        return Response.json({ threads: shown, counts, unreadByCharacter: byCharacter, adopted: roster })
      },

      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        const sessionId = readSession(body?.sessionId)
        if (!sessionId) return Response.json({ error: 'sessionId required' }, { status: 400 })
        const action = body?.action

        /* -------------------------------------------------------- adopt */
        if (action === 'adopt') {
          const characterId = parseInt(String(body?.characterId))
          const c = Number.isFinite(characterId) ? await character(characterId) : null
          if (!c) return Response.json({ error: 'No such character.' }, { status: 404 })
          const via = body?.via === 'social' ? 'social' : 'cmail'
          const fresh = await adopt(sessionId, c.id, via)
          // A new correspondent writes first — with the greeting its creator
          // wrote, not with anything generated, so the first mail is theirs.
          if (fresh) {
            const [t] = await db
              .insert(cmailThreads)
              .values({ sessionId, characterId: c.id, subject: `${c.name} has moved into your CMail`, unread: true })
              .returning({ id: cmailThreads.id })
            const greeting = c.greeting?.trim() || `${c.tagline ? `${c.tagline}.\n\n` : ''}Write to me any time.`
            await db.insert(cmailMessages).values({ threadId: t.id, author: 'character', status: 'received', body: `${greeting}\n\n— ${c.name}` })
          }
          return Response.json({ adopted: await adoptedRoster(sessionId), fresh }, { status: fresh ? 201 : 200 })
        }

        /* ------------------------------------------------------ release */
        if (action === 'release') {
          const characterId = parseInt(String(body?.characterId))
          if (!Number.isFinite(characterId)) return Response.json({ error: 'characterId required' }, { status: 400 })
          await db.delete(cmailAdoptions).where(and(eq(cmailAdoptions.sessionId, sessionId), eq(cmailAdoptions.characterId, characterId)))
          return Response.json({ adopted: await adoptedRoster(sessionId) })
        }

        /* ------------------------------------------------- send / draft */
        if (action === 'send' || action === 'draft') {
          const text = clip(body?.body, 8000)
          const subject = clip(body?.subject, 200) || '(no subject)'
          const voiceId = Number.isFinite(parseInt(String(body?.voiceId))) ? parseInt(String(body.voiceId)) : null
          let threadId = Number.isFinite(parseInt(String(body?.threadId))) ? parseInt(String(body.threadId)) : null
          let thread = threadId ? await ownThread(sessionId, threadId) : null
          if (threadId && !thread) return Response.json({ error: 'No such thread.' }, { status: 404 })

          const to = thread ? await character(thread.characterId) : await character(parseInt(String(body?.characterId)))
          if (!to) return Response.json({ error: 'Choose who the mail is to.' }, { status: 400 })
          if (action === 'send' && !text) return Response.json({ error: 'Write something first.' }, { status: 400 })

          // Writing to a character adopts it, the way mailing someone adds a contact.
          await adopt(sessionId, to.id, 'cmail')

          // An empty draft for a mail that does not exist yet is nothing to save.
          if (action === 'draft' && !text && !thread) return Response.json({ threadId: null, saved: false })

          if (!thread) {
            ;[thread] = await db.insert(cmailThreads).values({ sessionId, characterId: to.id, subject }).returning()
            threadId = thread.id
          }
          // One draft per thread: replace it, whichever way this request goes.
          await db.delete(cmailMessages).where(and(eq(cmailMessages.threadId, threadId!), eq(cmailMessages.status, 'draft')))

          if (action === 'draft') {
            if (!text) {
              // Discarding the only draft of a mail never sent discards the
              // mail: an empty thread in All Mail would be a ghost.
              const [left] = await db.select({ id: cmailMessages.id }).from(cmailMessages).where(eq(cmailMessages.threadId, threadId!)).limit(1)
              if (!left) {
                await db.delete(cmailThreads).where(eq(cmailThreads.id, threadId!))
                return Response.json({ threadId: null, saved: false })
              }
              return Response.json({ threadId, saved: false })
            }
            await db.insert(cmailMessages).values({ threadId: threadId!, author: 'me', status: 'draft', body: text, voiceId })
            await db.update(cmailThreads).set({ subject: thread.subject === '(no subject)' || !thread.subject ? subject : thread.subject }).where(eq(cmailThreads.id, threadId!))
            return Response.json({ threadId, saved: Boolean(text) })
          }

          await db.insert(cmailMessages).values({ threadId: threadId!, author: 'me', status: 'sent', body: text, voiceId })
          await db.update(cmailThreads).set({ lastAt: new Date(), trashed: false }).where(eq(cmailThreads.id, threadId!))

          // The character writes back. If it cannot, the mail is still sent —
          // it is in Sent — and the page is told no reply came, not shown one.
          const reply = await ask(replySystem(to), await history(threadId!, thread.subject || subject))
          if (reply) {
            await db.insert(cmailMessages).values({ threadId: threadId!, author: 'character', status: 'received', body: reply })
            await db.update(cmailThreads).set({ lastAt: new Date(), unread: true, archived: false, snoozedUntil: null }).where(eq(cmailThreads.id, threadId!))
          }
          return Response.json({ threadId, replied: Boolean(reply) }, { status: 201 })
        }

        /* ------------------------------------------------------- assist */
        if (action === 'assist') {
          const voiceId = parseInt(String(body?.voiceId))
          const [adoption] = Number.isFinite(voiceId)
            ? await db
                .select({ id: cmailAdoptions.id })
                .from(cmailAdoptions)
                .where(and(eq(cmailAdoptions.sessionId, sessionId), eq(cmailAdoptions.characterId, voiceId)))
                .limit(1)
            : []
          // Only an adopted character can be written as — adoption is the consent step.
          if (!adoption) return Response.json({ error: 'Adopt a character before writing as it.' }, { status: 403 })
          const voice = await character(voiceId)
          if (!voice) return Response.json({ error: 'No such character.' }, { status: 404 })
          const notes = clip(body?.body, 4000)
          if (!notes) return Response.json({ error: 'Jot down what you want to say first.' }, { status: 400 })
          const toName = clip(body?.toName, 80)
          const subject = clip(body?.subject, 200)
          const written = await ask(assistSystem(voice, toName), [{ role: 'user', content: `${subject ? `Subject: ${subject}\n\n` : ''}My notes:\n${notes}` }], 500)
          if (!written) return Response.json({ error: `${voice.name} could not be reached to write this. Your notes are untouched.` }, { status: 502 })
          return Response.json({ body: written, voice: { id: voice.id, name: voice.name } })
        }

        return Response.json({ error: 'Unknown action.' }, { status: 400 })
      },
    },
  },
})
