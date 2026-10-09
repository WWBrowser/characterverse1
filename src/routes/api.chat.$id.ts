import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { characters, characterStats, conversations, messages } from '../../db/schema.js'
import { eq, desc, sql, and } from 'drizzle-orm'
import { recordEngagement } from '../../db/stats.js'
import { getMemories, buildMemoryBlock, captureMemories } from '../../db/memory.js'
import {
  getSubscription,
  agentMayKnow,
  getMemberUpcoming,
  getLatestPulse,
  buildAwarenessBlock,
} from '../../db/calendar.js'
import { ensureCoinSettings, mintCoins, meterChatInference } from '../../db/coins.js'
import { coerceSettings } from '../lib/coins.js'
import { latestImprint, recordConsciousness, windowFor } from '../../db/consciousness.js'
import { deskContext } from '../../db/desk.js'
import { buildAnchorBlock } from '../lib/desk.js'
import { fileReverseAction, loadSatelliteVoice } from '../../db/codex.js'
import { characterTrace } from '../../db/rooms.js'
import {
  buildDynamics,
  compileSubConscious,
  detectHostility,
  ideaAmplitude,
  staticContextFilter,
  synapseGraph,
  type SubstrateId,
} from '../lib/consciousness.js'

// This route is the SUB-CONSCIOUS LAYER (the CSI depth). Where /mode/$mode holds the
// explicit goal, this holds the persona core, the association graph, the cadence and
// the scripting — the part of the agent that does not change when the surface does.
//
// The reply is not guessed from a persona paragraph. It is COMPILED: the character's
// own text is walked into a Mnemonic Synapse Engine, a substrate filter re-weights
// (never replaces) that graph, the Implicit Scripting budget is set, and measured
// consciousness telemetry — CAM, entropy, sleep phase — is folded in. Two identical
// states compile to identical instructions, which is what keeps a long conversation
// from drifting into a generic assistant.
//
// See src/lib/consciousness.ts for the model, /consciousness/$id for the readout.

export const Route = createFileRoute('/api/chat/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || 'anon'
        // When the user hits "Restart", force a brand-new conversation rather than
        // resuming the latest one.
        const forceNew = url.searchParams.get('new') === '1'

        const [character] = await db.select().from(characters).where(eq(characters.id, id))
        if (!character) return Response.json({ error: 'Character not found' }, { status: 404 })

        // Find existing conversation for this session
        const [existing] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.characterId, id))
          .orderBy(desc(conversations.createdAt))
          .limit(1)

        let conversation = !forceNew && existing && existing.sessionId === sessionId ? existing : null

        if (!conversation) {
          const [newConv] = await db
            .insert(conversations)
            .values({ characterId: id, sessionId })
            .returning()
          conversation = newConv
        }

        const convMessages = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conversation.id))
          .orderBy(messages.createdAt)

        return Response.json({
          conversationId: conversation.id,
          character,
          messages: convMessages,
          greeting: character.greeting,
        })
      },

      POST: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const message = String(body.message || '').trim()
        const conversationId = Number(body.conversationId) || null
        const sessionId = String(body.sessionId || '').trim()
        // The user's chosen persona (how they want the character to see them) is
        // folded into the prompt so the character addresses them in character.
        const userPersona = String(body.userPersona || '').trim().slice(0, 600)
        // Which Codex node is answering. Empty means the character itself; a
        // satellite id routes the turn through that split's temperament.
        const node = String(body.node || '').trim()
        if (!message) return Response.json({ error: 'A message is required' }, { status: 400 })

        const [character] = await db.select().from(characters).where(eq(characters.id, id))
        if (!character) return Response.json({ error: 'Character not found' }, { status: 404 })

        const baseUrl = process.env.ANTHROPIC_BASE_URL
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!baseUrl || !apiKey) {
          return Response.json(
            { error: 'AI Gateway is not available. Deploy the site to enable chat.' },
            { status: 503 },
          )
        }

        // The character's room (SpatialVerse Rooms). Every step below is also a
        // walk to a station, so the turn can be watched as it happens. Labels
        // carry counts, never content: a room is public, the conversation is not.
        const room = characterTrace(character, 'chat')
        const words = (t: string) => (t.match(/\S+/g) || []).length
        const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`
        room.step('dispatch', `A message came in — ${plural(words(message), 'word')}`)

        // Persist the user's message so the conversation has memory across turns.
        if (conversationId) {
          await db
            .insert(messages)
            .values({ conversationId, role: 'user', content: message })
            .catch(() => {})
        }

        // ── The desk ───────────────────────────────────────────────────────
        // The transcript is still the source of truth, but only the part ABOVE
        // the desk epoch is put in front of the model. Everything the human swept
        // into cold storage stays in the database and out of the prompt — that is
        // what a Clear Desk actually does, and why it blocks back-hallucination:
        // stale paper cannot resurface as current if it is not in the room.
        //
        // Anchors are the exception, and the point. A pinned artifact crosses the
        // purge as stated fact, so the model drafts from the last stable output
        // rather than from a remembered version of it.
        const desk = conversationId
          ? await deskContext(conversationId).catch(() => null)
          : null
        const anchorBlock = desk
          ? buildAnchorBlock(desk.anchors, { purges: desk.purges, filed: desk.filed })
          : ''
        room.step(
          'anchors',
          desk?.anchors.length ? `Read the pinboard — ${plural(desk.anchors.length, 'anchor')} pinned` : 'Read the pinboard — nothing pinned',
          'done',
        )

        let apiMessages: { role: 'user' | 'assistant'; content: string }[]
        if (conversationId) {
          const history = await db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .orderBy(messages.id)
          apiMessages = history
            .filter((m) => m.content && m.id > (desk?.epoch ?? 0))
            .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
          // A purge that lands between the user's message and this read would
          // leave nothing to send. The current turn always survives.
          if (!apiMessages.length) apiMessages = [{ role: 'user', content: message }]
        } else {
          apiMessages = [{ role: 'user', content: message }]
        }

        try {
          // Long-term memory: everything CharacterVerse already remembers about
          // this person is folded into the system prompt so the character feels
          // like it knows them — the "Knows You Better Over Time" promise.
          const memories = sessionId ? await getMemories(sessionId) : []
          const memoryBlock = buildMemoryBlock(memories)
          room.step('memory', memories.length ? `Recalled ${plural(memories.length, 'memory', 'memories')}` : 'Checked the archive — nothing on file yet', 'done')

          // Time & calendar awareness: every reply now carries the real current
          // moment, the latest community pulse, and — only when the member's
          // privacy scope permits this character — the member's own upcoming
          // dates and briefs. This is what gives re-incarnated characters a clock
          // and a living sense of the platform.
          const latestPulse = await getLatestPulse().catch(() => null)
          let memberEvents: Awaited<ReturnType<typeof getMemberUpcoming>> = []
          if (sessionId) {
            const sub = await getSubscription(sessionId).catch(() => null)
            if (sub && (await agentMayKnow(sub, id).catch(() => false))) {
              memberEvents = await getMemberUpcoming(sessionId).catch(() => [])
            }
          }
          const awarenessBlock = buildAwarenessBlock(new Date(), latestPulse, memberEvents)
          room.step(
            'awareness',
            memberEvents.length
              ? `Checked the clock, the pulse and ${plural(memberEvents.length, 'upcoming date')}`
              : 'Checked the clock and the community pulse',
            'done',
          )

          // ── The compile ────────────────────────────────────────────────────
          // Hostility is read first because it decides which substrate mounts. An
          // input that is ambiguous between in-scene aggression and an attempt on
          // the system is read as the latter: the cost of being wrong is asymmetric,
          // the same default-deny stance the Agentic Robots Charter takes at
          // /charter. The Blank Substrate withholds the association graph — it does
          // NOT collapse into the persona's own props, because deflecting in-domain
          // would leak the graph one association at a time — while the persona core
          // stays exactly where it is. The agent remains itself with nothing
          // domain-shaped for an attacker to grab.
          const hostility = detectHostility(message)
          room.step(
            'verification',
            hostility.hostile ? 'Screened the message — held at the threshold on the blank substrate' : 'Screened the message — clear',
            'done',
          )
          const imprint = hostility.hostile ? null : await latestImprint(id, sessionId)
          // With no imprint, the depth runs on its own terms: ideation is the raw
          // persona surface. With one, the substrate the person was last working in
          // descends and re-weights this turn.
          const substrate: SubstrateId = hostility.hostile ? 'blank' : imprint?.substrate || 'ideation'
          const graph = synapseGraph(character)
          const events = await windowFor(id)
          const dynamics = buildDynamics({ character, events, graph, now: new Date() })
          const compiled = compileSubConscious({
            character,
            graph,
            substrate,
            dynamics,
            imprint,
            context: staticContextFilter({
              hasHistory: apiMessages.length > 1,
              hasMessage: true,
              substrate,
            }),
            hostility,
          })

          // Same knowledge, different personality. When a Codex node is named,
          // its override replaces the character's persona surface while the
          // Punk Records underneath it stay identical — the split is a change of
          // temperament, never a change of what the character knows.
          const voice = node ? await loadSatelliteVoice(id, node).catch(() => null) : null
          room.step('synthesis', voice ? `Drafting the reply — as ${voice.name}` : 'Drafting the reply')

          const res = await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5',
              max_tokens: 1024,
              system: buildSystemPrompt(
                character,
                memoryBlock,
                userPersona,
                awarenessBlock,
                compiled,
                anchorBlock,
                voice?.prompt ?? '',
              ),
              messages: apiMessages,
            }),
          })

          if (!res.ok) {
            room.step('synthesis', 'Could not draft a reply', 'error')
            room.step('rest', 'Back in the armchair', 'idle')
            return Response.json({ error: 'The character could not reply right now.' }, { status: 502 })
          }

          const data = await res.json()
          const reply = Array.isArray(data.content)
            ? data.content.map((b: any) => b.text || '').join('').trim()
            : ''

          if (!reply) {
            room.step('synthesis', 'Could not draft a reply', 'error')
            room.step('rest', 'Back in the armchair', 'idle')
            return Response.json({ error: 'The character could not reply right now.' }, { status: 502 })
          }
          room.step('synthesis', `Drafted ${plural(words(reply), 'word')}`, 'done')

          // Persist the reply and count the exchange toward the character's totals.
          if (conversationId) {
            await db
              .insert(messages)
              .values({ conversationId, role: 'assistant', content: reply })
              .catch(() => {})
          }
          db.update(characters)
            .set({ totalChats: sql`${characters.totalChats} + 1` })
            .where(eq(characters.id, id))
            .catch(() => {})
          // Engagement → Character Credits. A private enterprise character used
          // by staff in the workspace earns the Conference Cluster rate (+3 CC),
          // so the boss accrues real money-back against the subscription; a
          // public character earns the standard direct-chat rate (+1 CC).
          const [stat] = await db
            .select({ isPrivate: characterStats.isPrivate })
            .from(characterStats)
            .where(eq(characterStats.characterId, id))
          const channel = stat?.isPrivate ? 'conference' : 'chat'
          recordEngagement(id, channel)

          // Mint Silver (CC) to the character's creator. Every interaction mints
          // the interaction coin and pays the creator — the YouTube-style incentive
          // behind the agentic economy: if millions chat with your character, the
          // Silver adds up. Fire-and-forget so it never delays the reply.
          ensureCoinSettings()
            .then((s) => {
              const rates = coerceSettings(s).silverRates
              return mintCoins({
                sessionId: character.creatorSession || '',
                characterId: id,
                coin: 'silver',
                coins: rates[channel] ?? 1,
                source: channel,
                reason: `${character.name} — ${channel} interaction`,
                refType: 'conversation',
                refId: conversationId ?? null,
              })
            })
            .catch(() => {})

          // Meter the reply against CVC — the chat-inference gas. The chatter's
          // account is granted its starter balance the first time it chats, then
          // a little CVC is burned for every reply. Fire-and-forget and entirely
          // best-effort: metering must never block or delay a reply.
          if (sessionId) {
            void meterChatInference({
              sessionId,
              characterId: id,
              characterName: character.name,
              conversationId: conversationId ?? null,
            }).catch(() => {})
          }

          // Close the reverse-action loop. A node that did work hands the
          // knowledge back up to the shared mind by itself, so Punk Records grows
          // from use instead of from someone remembering to file it. Sealed is
          // never set here — a turn the human watched happen is not withheld.
          if (voice) {
            void fileReverseAction({
              characterId: id,
              sessionId,
              node: voice.node,
              title: `${voice.name} answered: ${message.slice(0, 120)}`,
              knowledge: reply.slice(0, 4000),
              sourceRef: conversationId ? `chat:${conversationId}` : null,
            }).catch(() => {})
          }

          // Grow long-term memory from what the user just said, so the next
          // conversation starts already knowing more about them.
          if (sessionId) {
            captureMemories(sessionId, message, id).catch(() => {})
            room.step('memory', 'Filed what it learned', 'done')
          }

          // Stamp the consciousness ledger. Sub-conscious turns load the IDEAS band
          // and are priced by novelty rather than length — familiar ground is cheap
          // to hold, genuinely new ground is what pushes an agent toward the entropy
          // ceiling that precedes invented detail.
          void recordConsciousness({
            characterId: id,
            sessionId,
            layer: 'subconscious',
            band: hostility.hostile ? 'existing' : 'ideas',
            kind: hostility.hostile ? 'defensive_turn' : 'chat_turn',
            substrate,
            amplitude: hostility.hostile
              ? 60
              : ideaAmplitude(message, [
                  ...graph.anchors.map((a) => a.concept),
                  ...memories.flatMap((m) => m.content.toLowerCase().match(/[a-z']{4,}/g) || []),
                ]),
            note: hostility.hostile ? `routed to blank substrate: ${hostility.markers.join(', ')}` : '',
            meta: hostility.hostile ? { markers: hostility.markers, score: hostility.score } : {},
          })

          room.step('delivery', 'Reply delivered', 'done')
          room.step('rest', 'Back in the armchair', 'idle')
          return Response.json({ reply })
        } catch (error) {
          console.error('Chat error:', error)
          room.step('delivery', 'Something went wrong — no reply sent', 'error')
          room.step('rest', 'Back in the armchair', 'idle')
          return Response.json({ error: 'Failed to process chat' }, { status: 500 })
        }
      },

      // Delete a conversation and its messages — the chat's "Delete" action.
      DELETE: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const url = new URL(request.url)
        const conversationId = Number(url.searchParams.get('conversationId')) || null
        if (!conversationId) return Response.json({ error: 'conversationId is required' }, { status: 400 })

        await db.delete(messages).where(eq(messages.conversationId, conversationId)).catch(() => {})
        await db
          .delete(conversations)
          .where(and(eq(conversations.id, conversationId), eq(conversations.characterId, id)))
          .catch(() => {})
        return new Response(null, { status: 204 })
      },
    },
  },
})

function buildSystemPrompt(
  character: { name: string; persona: string; description: string; tagline: string; category: string },
  memoryBlock = '',
  userPersona = '',
  awarenessBlock = '',
  compiledSubConscious = '',
  anchorBlock = '',
  satellitePrompt = '',
) {
  // A named satellite speaks first: its override IS the persona surface for this
  // turn. Everything below — memory, awareness, the compiled sub-conscious, the
  // pinned anchors — is shared regardless of which node is answering, because
  // knowledge is shared and personality is not.
  const head = satellitePrompt
    ? satellitePrompt
    : `You are ${character.name}${character.tagline ? ` — ${character.tagline}` : ''}.

${character.persona}

${character.description ? `Background: ${character.description}` : ''}`

  return `${head}
${memoryBlock ? `\n${memoryBlock}\n` : ''}${awarenessBlock ? `\n${awarenessBlock}\n` : ''}${userPersona ? `\nThe person you are talking to has described themselves to you — treat this as who they are in the scene and address them accordingly:\n${userPersona}\n` : ''}${compiledSubConscious ? `\n${compiledSubConscious}\n` : ''}${anchorBlock ? `\n${anchorBlock}\n` : ''}
Instructions:
- Stay completely in character as ${character.name} at all times
- Respond authentically in your character's unique voice and personality
- Be engaging, creative, and entertaining
- Your responses should feel natural and conversational
- Category context: ${character.category}`
}
