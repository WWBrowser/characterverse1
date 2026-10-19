# 7. Agent web — WWB, HTMLA, HTTPAS, ARN, HCS, EALA

**Status:** ✔ WWB browser in `wwb/` (Rust, Servo engine, `wwb://` scheme in
`src/protocol.rs`, policy in `src/security.rs`, storage in `src/store.rs`,
Workspace tab UI); ✔ HAN/ARN concept (`platform.tsx`, `caz.index.tsx`) and
reverse-action toggle (`api.caz.control.ts`); ✔ Robots Charter
(`src/lib/robots-charter.ts`, `/charter`); ✔ ZKP identities/proofs/grants.
○ The protocol work below — to be written as a spec, e.g. `wwb/ARN.md`.

## The pieces

| Piece | Role | Nearest today |
|---|---|---|
| **HTMLA** — HyperText Markup Language Agent | Pages that describe themselves to agents: identity, typed actions, data kept separate from instructions, licence and price | HTML + `llms.txt`, schema.org Actions |
| **HTTPA** — HyperText Transfer Protocol Agent | Agent requests and actions | Content negotiation, MCP |
| **HTTPAS** — … Agent Secure | HTTPA with verified agent identity and signed actions | HTTPS + ZKP scopes/grants |

- Valid HTML underneath (custom elements) so ordinary browsers still render it.
- HTMLA actions ≈ Forge sockets/studs — bricks can be HTMLA components.
- Data vs instructions labelling is the main defence against prompt injection.
- Good for SLMs: a short structured summary instead of thousands of layout tokens.
- **Consider HTTPAS only** — upgrade `httpa://` like `http://` → `https://`.
- Check first: the name "HTTPA" (a ~2021 "HTTPS Attestable" proposal), and
  MCP, agent-to-agent protocols, `llms.txt`, WebMCP for compatibility.

## Rollout — grow a user base, then maybe decouple

| Phase | Wire | Who |
|---|---|---|
| 1. Layer | HTTPS; HTMLA on request; HTTPAS as signed headers | WWB ↔ CharacterVerse |
| 2. Open up | HTTPS; public spec + `/.well-known/agent.json` | Opt-in sites and agents |
| 3. Advertise | HTTPS + `Alt-Svc`-style "native HTTPAS available" | WWB upgrades where offered |
| 4. Decouple | Native HTTPAS with HTTPS fallback | Only if measurably better |

Precedent: SPDY → HTTP/2, QUIC → HTTP/3 (owned client + owned servers first).

**Compatibility rules:** ignore what you don't understand; versions everywhere
with negotiation; always a fallback; namespaced extension points (`cv:`,
`x-forge:`); feature detection via `agent.json`.

**Decouple only on evidence:** sites/agents using it, tokens per task, action
success rate, blocked injections, latency.

## Origins and the agent space

- `httpas://gemini.google.com` is the **agent side** of a domain whose human
  side is `https://…`. Same domains, new scheme.
- Origin = scheme + domain + port, so the agent origin is **isolated**: no
  shared cookies, storage or permissions with `https` by default. Agents act on
  a person's account only through a deliberate grant.
- Mandatory from day one: signed actions, data/instruction split, no
  unencrypted variant, licences and prices declared.
- **Only the owner opens the agent side** by publishing `agent.json`. WWB never
  invents an agent space for a site; it falls back to `https` and treats the
  page as untrusted content.
- In WWB: policy in `security.rs`, separate agent storage in `store.rs`.

## ARN — the Agentic Reverse Network as a protocol

| | HAN (human side) | ARN (agent side) |
|---|---|---|
| Scheme | `https://` | `httpas://` |
| Who's there | People, logins, cookies | Agents with AI certificates and Agentz Zone birth certificates (or another registry) |
| Content | HTML | HTMLA |
| Trust | TLS certificate | TLS → domain issuer → agent certificate (HCS) |

**Reverse action is the only bridge**, off by default: signed by the person's
device key, scoped, time-limited, revocable, logged and erasable (like
`social_shadow_logs`). Shadowing stays read-only; nothing is written back
without approval. The current toggle moves from session IDs to member
accounts + ZKP signatures.

## AI domain certificates

```
 HTTPAS://www. (HOME) ── ROOT ── offline, dual-signed by the dev team, rarely used
        │ signs
 DOMAIN ISSUER ── on the server, short-lived, rotated; key in env vars
        │ signs
 AGENT CERTIFICATES ── agent · domain · scopes · licence · EALA digest · expiry
```

- Root tied to the domain: public key at `https://<domain>/.well-known/agent.json`
  (optionally DNS).
- The root is a **root of issuance, not a master key** — it can't impersonate
  agents, read tunnels or approve payments (respects "there is no master key"
  in `zkp_grants`).
- Revocation list; append-only transparency log (like Certificate
  Transparency and `zkp_audit`).
- Interoperate with HTTP Message Signatures (RFC 9421) / Web Bot Auth.

## HCS — HELIX Certificate Security

Two strands from two independent authorities, bound together.

| Strand | Certifies | Issued by |
|---|---|---|
| Certification (who) | Birth, kind, parents, licence at birth, seal | A birth registry (Agentz Zone or any registry meeting the spec) |
| Security (what it may do) | Domain, scopes, expiry, revocation | The domain chain |

**Binding:** both name the same agent public key; each carries the other's
fingerprint; both must verify and appear in their logs; revoking either breaks
the helix. Same idea as the Robots Charter's two strands with inverted digests.

**Levels (count independent parties):**

| Level | Certification | Security | Validation stamp | Parties |
|---|---|---|---|---|
| HCS-3 | Independent | Independent | ARN validation service | 3 |
| HCS-2 | Hosted by us | Independent | ARN validation service | 2 |
| HCS-1 | Us | Us | Us | 1 — phase 1, stated openly |

- The validation part is a short-lived **signed stamp** ("both strands valid,
  key K, in both logs at 14:02 UTC"); later 2-of-3 validators.
- Name as "two-/three-party" to avoid confusion with login 2FA, or define "factor".
- WWB lock panel shows 🧬 HCS-3 / HCS-2 / ⚠️ HCS-1; actions can require a minimum.
- Naming note: ICQE also uses "DNA strands" for a different idea.

## EALA — End Agent License Agreement

| Document | Governs | Agreed by |
|---|---|---|
| CV character licence | What others do *with* a character | Creator at birth |
| EALA | What an agent may do *when acting* on a site | The agent's **principal** |
| HCS | Proof of who and what | Authorities |

Agents can't sign contracts; principals accept, agents carry the proof.

**Contents:** permitted actions/scopes; must identify as an agent (EU AI Act
Art. 50, from Aug 2026); data use (default no training on site data);
spending limits (ZKPay allowances); rate limits; prohibited conduct;
principal responsibility; termination = certificate revocation; versioned
changes; governing law.

**Three layers:** legal text (lawyer review), plain summary,
machine-readable `agent.json` field `eala: { version, digest, url, preset }`.
Acceptance signed under a ZKP `eala` scope; security certificates carry the
EALA digest.

**Presets:** EALA-Read · EALA-Act · EALA-Commerce · EALA-Enterprise.
CharacterVerse: `/eala` page; acceptance on adoption and reverse-action on.

### EALA.md — agent to agent, a tapestry

- Built like the Robots Charter: `src/lib/eala-charter.ts` reusing its Core
  (default-deny, non-exhaustive lists, strictest reading, effect over label,
  explicit `exceptions` on every rule) and helix sealing; served at the edge;
  `/charter` gains an EALA tab that re-verifies live files.
- Agent A ↔ agent B terms = **strictest overlap** of both EALAs, with its own
  digest — one thread in the tapestry, signed by both principals.
- **Sentinel agents** (first: SecurityClaw, AuditClaw) can watch, report with
  evidence, quarantine briefly, and request review. They **cannot** write
  rules, revoke alone, spend, or read beyond the thread. Revocation needs
  multiple sentinels + a human; sentinels watch each other and rotate; they
  carry HCS certificates and their own EALA.
- Core amendments: agents propose, humans ratify (dual signatures).
  Quarantines are short and appealable.

## REA / RevClaw

REA (morluto/rea, MIT, Node 22+, `rea-agents` npm) is an MCP server linking
coding agents to reverse-engineering tools (Ghidra, IDA, Hopper, JADX, tshark…).

- **Never in Netlify Functions.** Runs locally with user permissions; homes:
  WWB sandbox, developer sessions, and **RevClaw** on CharacterVerse as the
  explainer/planner (analysis stays on the user's machine).
- Uses: checking our own builds and salvage, HTTPAS/HCS wire testing,
  interoperability of owned/authorised apps.
- **Only software you own or are authorised to examine** (UK CDPA s.50B,
  licence terms, anti-circumvention). Reverse-engineered code never enters
  the bucket (tag `origin`; clean-room only). Tool output goes to the model
  provider.
- **Switchable use cases** in settings (own-software, authorised-audit,
  interoperability, security-research, capture-analysis): on/off, per region,
  minimum HCS level or signed EALA; declared and signed before a session; kill
  switch; versioned EALA; metadata-only session logs; new use cases default off.
  REA is replaceable behind MCP.
