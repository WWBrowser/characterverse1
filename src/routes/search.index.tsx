import { useEffect, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Bot, Box, FileJson, Layers, MessageSquare, Plus, Radio } from 'lucide-react'
import { getSessionId } from '../lib/create-ui'
import { SearchSurface } from '../lib/search-ui'
import { AGENTECH_ACCENT, AgentechSurface } from '../lib/agentech-ui'
import { SPATIAL_ACCENT, SpatialSurface } from '../lib/spatial-ui'
import { VerseChrome, VerseChromeFooter } from '../lib/verse-chrome'
import { FRAMES } from '../lib/searchindex'

// /search — CharacterVerse Search.
//
// The page wears its own chrome (VerseChrome) instead of the app's sidebar
// layout — a search engine's most valuable asset is an empty page with one box
// in the middle of it, and a hub band above that box competes with it. The
// chrome carries the two named destinations, CStore and CMail, the Seven
// Entrances mark, and the launcher, which between them reach every Verse.
//
// The page is almost nothing: a session id, the surface, and a footer that
// explains the two frame kinds. All the behaviour lives in SearchSurface,
// because the workspace overlay mounts the same component and a second copy
// would have drifted within a week.
//
// `?q=` is honoured so a result page is a link you can send someone. That is
// most of what makes a search engine a search engine rather than a text box.
//
// Three engines, one page. The flip above the box turns between
// CharacterVerse Search (chat-based: find someone to talk to), AgentechVerse
// Search (task-based: find agents to do the work) and SpatialVerse Search
// (spatial: find a thing by where it is inside a 3D space). `?verse=` names
// the face — `agentech` or `Spatial` — so every face is linkable, and `?q=`
// runs a search on whichever face the link opens. All three surfaces stay
// mounted and the flip only hides the others — flipping away and back must
// not throw away a result page.

type Side = 'character' | 'agentech' | 'spatial'

/** The `?verse=` value each face writes. Read case-insensitively. */
const VERSE_PARAM = { agentech: 'agentech', spatial: 'Spatial' } as const
type VerseParam = (typeof VERSE_PARAM)[keyof typeof VERSE_PARAM]

function sideOf(verse: VerseParam | undefined): Side {
  return verse === 'agentech' ? 'agentech' : verse === 'Spatial' ? 'spatial' : 'character'
}

export const Route = createFileRoute('/search/')({
  component: SearchPage,
  // Typed as optional rather than `q: string | undefined`, so every other page
  // can link to /search without being forced to name a search param it does not
  // care about.
  validateSearch: (search: Record<string, unknown>): { q?: string; verse?: VerseParam } => {
    const verse = typeof search.verse === 'string' ? search.verse.toLowerCase() : ''
    return {
      ...(typeof search.q === 'string' && search.q.trim() ? { q: search.q.slice(0, 400) } : {}),
      ...(verse === 'agentech' || verse === 'spatial' ? { verse: VERSE_PARAM[verse] } : {}),
    }
  },
})

const FACES: { side: Side; name: string; kind: string; icon: typeof Bot }[] = [
  { side: 'character', name: 'CharacterVerse', kind: 'chat-based AI', icon: MessageSquare },
  { side: 'agentech', name: 'AgentechVerse', kind: 'task-based AI', icon: Bot },
  { side: 'spatial', name: 'SpatialVerse', kind: 'spatial AI', icon: Box },
]

/**
 * The flip. All three names on one bar, the current one lit — "you are here,
 * the others are a press away". Each face is its own button rather than one
 * button that cycles: with three faces, a cycle makes the second one cost a
 * press you did not want.
 */
function SearchFlip({ side, onFlip }: { side: Side; onFlip: (to: Side) => void }) {
  return (
    <div
      role="group"
      aria-label="Search engine"
      className="cvsf-flip"
      data-side={side}
      style={{ ['--cvsf-agentech' as string]: AGENTECH_ACCENT, ['--cvsf-spatial' as string]: SPATIAL_ACCENT }}
    >
      {FACES.map(({ side: s, name, kind, icon: Icon }) => (
        <button
          key={s}
          type="button"
          className="cvsf-face"
          data-face={s}
          data-on={s === side || undefined}
          aria-pressed={s === side}
          onClick={() => { if (s !== side) onFlip(s) }}
          title={`${name} Search — ${kind}`}
        >
          <Icon size={13} />
          <span>
            {name} <small>{kind}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

function SearchPage() {
  const { q, verse } = Route.useSearch()
  const navigate = useNavigate({ from: '/search/' })
  const [sessionId, setSessionId] = useState('')
  const side = sideOf(verse)
  // The flip-in animation is held back until the first flip, so a page load
  // does not spin. No remount is needed to replay it: a face coming back from
  // `hidden` restarts its animation on its own, and it keeps its state.
  const [turned, setTurned] = useState(false)

  useEffect(() => { setSessionId(getSessionId()) }, [])

  const flip = (to: Side) => {
    setTurned(true)
    // replace, not push: the flip is a view of this page, and Back should leave
    // /search rather than step through every time you turned it over.
    void navigate({
      search: (prev) => ({ ...prev, verse: to === 'character' ? undefined : VERSE_PARAM[to] }),
      replace: true,
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <VerseChrome active="search" />

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '18px 20px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
          <SearchFlip side={side} onFlip={flip} />
        </div>

        <div className="cvsf-stage">
          <div className="cvsf-side" hidden={side !== 'character'} data-turned={turned || undefined}>
            <SearchSurface sessionId={sessionId} variant="page" initialQuery={side === 'character' ? q || '' : ''} />
          </div>
          <div className="cvsf-side" hidden={side !== 'agentech'} data-turned={turned || undefined}>
            <AgentechSurface initialQuery={side === 'agentech' ? q || '' : ''} />
          </div>
          <div className="cvsf-side" hidden={side !== 'spatial'} data-turned={turned || undefined}>
            <SpatialSurface initialQuery={side === 'spatial' ? q || '' : ''} />
          </div>
        </div>

        {side === 'spatial' ? (
          <footer
            style={{
              marginTop: 46,
              paddingTop: 22,
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Box size={13} color={SPATIAL_ACCENT} />
              <h2 style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)' }}>The Spatial DOM</h2>
            </div>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.75, maxWidth: 760 }}>
              Crawlers index pages because pages have a DOM. 3D spaces have never had one, which is why nobody can
              search for the book on the second shelf. SpatialVerse indexes spaces published in the Spatial DOM: a tree
              of typed nodes — space, room, furniture, surface, container, object — each with a box in metres. Authors
              write down only what a thing is and where it is. On, in, near, above, below, left and right, and every
              &ldquo;second&rdquo;, are derived from the geometry, so two spaces built by two different people answer
              the same question the same way. Units are metres, y is up, the viewer stands at the front looking back;
              shelves count from the top unless you say otherwise, and the page always shows which way it counted.
            </p>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <a href="/api/spatial?scene=the-virtual-library" className="cvsf-foot-btn" data-primary="" data-face="spatial">
                <FileJson size={13} /> Read a space in the Spatial DOM
              </a>
              <a href="/api/spatial?scenes=1" className="cvsf-foot-btn">
                <Layers size={13} /> Every indexed space
              </a>
            </div>
          </footer>
        ) : side === 'agentech' ? (
          <footer
            style={{
              marginTop: 46,
              paddingTop: 22,
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gap: 14,
            }}
          >
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.75, maxWidth: 720 }}>
              AgentechVerse Search reads a task for its stages — research, drafting, analysis, checking,
              delivery — and staffs each from two pools: gigs on the Jobs marketplace, which deliver at a quoted
              price, and AgentzZone agents, whose spec sheets list what they can do. The ranker picks the staff;
              the planner only rewrites the plan's wording, and a step nothing fits is left unstaffed rather
              than filled with a guess.
            </p>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <Link to="/cvj/post" className="cvsf-foot-btn" data-primary="">
                <Plus size={13} /> Post a task as a gig
              </Link>
              <Link to="/caz" className="cvsf-foot-btn">
                <Bot size={13} /> Browse the AgentzZone
              </Link>
            </div>
          </footer>
        ) : (
        <footer
          style={{
            marginTop: 46,
            paddingTop: 22,
            borderTop: '1px solid var(--border)',
            display: 'grid',
            gap: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio size={13} color="var(--accent-light)" />
            <h2 style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)' }}>
              Two ways to attach something we do not host
            </h2>
          </div>

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {(['inframe', 'oframe'] as const).map((id) => {
              const f = FRAMES[id]
              return (
                <div
                  key={id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    borderLeft: `2px solid ${id === 'inframe' ? 'var(--accent)' : 'var(--border)'}`,
                    background: 'var(--bg-card)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>
                      {f.label}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        color: id === 'inframe' ? 'var(--accent-light)' : 'var(--text-secondary)',
                      }}
                    >
                      {f.verb}
                    </span>
                  </div>
                  <p style={{ margin: '7px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    {f.behaviour}
                  </p>
                </div>
              )
            })}
          </div>

          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.75, maxWidth: 720 }}>
            The index is hosted here and open to everyone: reads are public and
            cross-origin, and anyone can publish an AI system into it. What the index
            measures is consumption — impressions, opens, dismissals and refused
            embeds — because the question it exists to answer is which externally
            hosted systems people actually want, and that is not answerable from a
            directory listing. What it does not record is anything said inside an
            external system. The row ends at the hand-off.
          </p>

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <Link
              to="/search/add"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 13px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <Plus size={13} /> Add a character or AI system
            </Link>
            <Link
              to="/workspace"
              search={{ slate: undefined }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 13px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: 12.5,
                textDecoration: 'none',
              }}
            >
              <Layers size={13} /> Open the workspace
            </Link>
          </div>
        </footer>
        )}
      </div>

      <VerseChromeFooter
        note={
          side === 'spatial'
            ? 'SpatialVerse Search — find things by where they are'
            : side === 'agentech'
              ? 'AgentechVerse Search — say the task, staff the plan'
              : 'CharacterVerse Search — one index, internal and external'
        }
      />
    </div>
  )
}
