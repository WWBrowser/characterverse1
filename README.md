# CharacterVerse

An AI-powered character platform where users can create, discover, and chat with custom AI characters — similar to Character.AI. Built for entertainment, education, roleplay, and creative exploration.

## Features

- **Discover** — Browse a grid of community characters filtered by category (Roleplay, Learn, Gaming, Coaching)
- **Create** — Build your own AI character with a name, persona, backstory, greeting, and avatar
- **Chat** — Stream real-time conversations powered by Anthropic Claude through Netlify AI Gateway
- **Profile** — View character details, greeting previews, and stats
- **Learn** — Dedicated page for educational characters (language practice, science tutors, philosophy)
- **Persistent storage** — Characters, conversations, and messages stored in Netlify Database (Postgres)

## Tech Stack

- **Framework**: TanStack Start (React, file-based routing)
- **Database**: Netlify Database + Drizzle ORM (Postgres)
- **AI**: Anthropic Claude (claude-haiku-4-5) via Netlify AI Gateway
- **Streaming**: TanStack AI + Server-Sent Events
- **Styling**: Tailwind CSS v4 + custom dark theme
- **Deploy**: Netlify

## Running Locally

```bash
npm install
netlify dev
```

Open [http://localhost:8888](http://localhost:8888).

> Requires a Netlify site linked for AI Gateway and Database access.
