# CharacterVerse — Agent Guide

An AI-powered character platform where users create, discover, and chat with custom AI characters — for entertainment, education, roleplay, and creative exploration.

## Architecture

TanStack Start (React SSR) deployed on Netlify, with Netlify Database (Postgres via Drizzle ORM) and AI via Netlify AI Gateway.

```
src/routes/
├── __root.tsx              # Root layout: sticky navbar with CharacterVerse brand + nav links
├── index.tsx               # Discovery page: character grid, search, category filters, hero
├── create.tsx              # Create character form (name, persona, avatar, category, greeting)
├── learn.tsx               # Learning hub page with subject categories
├── characters.$id.tsx      # Character profile (greeting preview, stats, start chat CTA)
├── chat.$id.tsx            # Chat interface with streaming AI, typing indicator, auto-scroll
├── api.characters.ts       # GET (list/search/filter) / POST (create) characters
├── api.characters.$id.ts   # GET / PATCH / DELETE single character
├── api.chat.$id.ts         # GET (init conversation) / POST (stream AI response)
└── api.seed.ts             # POST to seed 8 initial characters (idempotent)

db/
├── schema.ts               # Drizzle ORM: characters, conversations, messages tables
└── index.ts                # DB client using drizzle-orm/netlify-db

drizzle.config.ts           # Outputs migrations to netlify/database/migrations/
netlify/database/migrations/ # Auto-generated SQL migrations (applied by Netlify)
src/styles.css              # Dark theme CSS custom properties + typography
```

## Key Technical Decisions

- **AI Model**: `claude-haiku-4-5` via Netlify AI Gateway — fast streaming for character roleplay
- **Streaming**: TanStack AI `chat()` + `toServerSentEventsResponse()` on server; `useChat` + `fetchServerSentEvents` on client
- **Greeting**: Shown client-side from the GET `/api/chat/$id` response before any user message — not a real AI call
- **Session tracking**: `localStorage` key `cv_session` holds a random ID for conversation association
- **Seeding**: `/api/seed` POST is idempotent — checks for existing characters before inserting
- **Character system prompt**: Built in `buildSystemPrompt()` in `api.chat.$id.ts`, injects name, tagline, persona, description
- **Styling**: CSS custom properties (dark theme vars) + inline styles for component control; no Tailwind dark mode

## Conventions

- Database imports: `.js` extension required — `from '../../db/index.js'`
- API responses: `Response.json(data)` for data, `new Response(null, { status: 204 })` for empty
- New pages: `src/routes/mypage.tsx` with `createFileRoute('/mypage')({...})`
- New API routes: `src/routes/api.myroute.ts` with `server: { handlers: { GET, POST, ... } }`
- Schema changes: Edit `db/schema.ts` → run `npx drizzle-kit generate`
- Categories: Update `CATEGORIES` array in both `index.tsx` and `create.tsx`

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start (React 19, TanStack Router v1) |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 + CSS custom properties |
| AI | Anthropic Claude via Netlify AI Gateway + TanStack AI |
| Database | Netlify Database + Drizzle ORM @beta |
| Deployment | Netlify |
