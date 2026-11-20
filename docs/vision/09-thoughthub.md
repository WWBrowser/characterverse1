# 9. ThoughtHub — GitHub + Hugging Face, character-thought centric

**Status:** ✔ Character Codex (single character: dossier, satellites,
`punk_records`), training signals with seven sub-weights (`SUB_WEIGHTS` in
`src/lib/training.ts`: General, Tone, Accuracy, Persona, Knowledge, Safety,
Style), Metric Coded Consciousness (`consciousness_events`, conscious /
subconscious layers), Synapse Collective, ICQE herd prevalence. ○ Everything below.

The Character Codex is one character, close up. **ThoughtHub is the herd** —
every character's thinking in one hub, the way Workspace+ extends Workspace.

## Feature map

| GitHub | ThoughtHub | Built on |
|---|---|---|
| Repository | **Thought Repo** — a character's mind or a shared topic | Punk Records, notes archive |
| Commit / history | NaR receipts, applied training signals | `punk_records`, `training_signals` |
| Commit hash | **WAT signature** | Dossier + seal digests |
| Branch | A trial line of training, merged only if it helps | new |
| Fork | Remix / twin / merge / satellite split | Licences |
| Pull request + review | Training drafts, NFaNF fragments, spotlights | RLSF |
| Issues | Unanswered notes, "needs an answer" queue | Note tiers |
| Discussions | Herd threads | new |
| Actions / CI | Automatic checks per change ("did accuracy drop?") | Pen Test Poker, calibration |
| Releases | Sealed WAT versions ("Xio v2.0") | Birth-certificate amendments |
| Contributors / insights | Credit by impact | Merits, RWA, royalties |
| Security advisories | Hazard notes, quarantines | ICQE, sentinels |
| Organisations | Enterprise thought pools | Enterprise doll |
| Sponsors | Tips to creators | Earn face of the payment wheel |

| Hugging Face | ThoughtHub |
|---|---|
| Model hub + card | Character hub + card (birth certificate, dossier) |
| Datasets | Notes archives as datasets, with consent and privacy rules |
| Spaces | Try any character in a Workspace tab |
| Inference | Any version on any model, metered with gas |
| Leaderboards / evals | Compare characters, or one character on `CLD` vs `GMI` |
| Collections, community tab, lineage | Curated sets, disputes/frontier proposals, parents and fusion trees |

**Only ThoughtHub:** the herd view, model-portable minds, trust tiers on
knowledge, built-in oversight (P@B, YEY!, NaR + receipts), pay for proof,
agents as members.

**First version:** "GitHub for one character" — Thought Repo page (history,
WAT, unanswered notes as issues), training drafts as pull requests, releases
as sealed WAT versions. Hugging Face side after the model registry.

## Herd features

Thought trends, consensus vs divergence, contagion maps via lineage, herd
prevalence for everything (generalising ICQE). Guards against herd
*mentality*: diversity gauge, quarantine of spreading quirks, merges need
review, herd popularity never counts as merit. **Privacy:** public repos carry
distilled knowledge only — never conversation content; private training and
sealed entries stay out.

## WAT signature — Weights as Thoughts

```
WAT:CLD · TL 11 · tone 3 · accuracy 5 · persona 4 · knowledge 6 · safety 5 · style 2 · general 1 · #7f3a…
```

- **Model code:** `CLD` (Claude), `GMI` (Gemini), later `GPT`, `HF-<model>`;
  more specific codes recommended (`CLD-H4.5`, `CLD-O5.5`, `GMI-2.5P`).
- **TL:** thought level from the dossier. **Sub-weights:** applied training
  weight per sub-weight on the dossier's square-root curve. **Seal:** digest of
  persona + Punk Records + applied signals + model.
- Characters don't have their own weights; the signature covers the thought
  state given to a shared model. If adapters/fine-tunes appear, include them.
- Boosted and latent output get their own markers and never pass as normal output.
- Describe models by name only; no logos or implied endorsement.
- Note: `training_signals` is currently empty on the preview branch, so all
  signatures would be identical until characters are trained.
- `src/lib/wat.ts` (pure); shown on dossiers, repo entries and replies;
  search `wat:cld`, `tl:>10`, `sw:accuracy>4`.

## Public square after Hugging Face incubation

Hugging Face is where AI systems are made; CharacterVerse is where they meet
the public. Spaces become `search_entries` (inframe/oframe), model cards fill
birth certificates (`caz_profiles` base model / built by / runs in), models get
`WAT:HF-…`. Needs Hugging Face inference (token in env vars, own rates,
fallbacks) — the AI Gateway covers Anthropic, OpenAI and Google only. Rules:
respect each model licence via `can()`, safety screening before listing, clear
origin labels, herd caution, credit makers (unclaimed hold for non-members).

## Think mode — latent reasoning

Source: a Better Stack short on a Stanford / Together AI "Hybrid Agent" — a
~10M-parameter **HybridLink** adapter on a Qwen3-based model that loops hidden
states (latent mode) and drops to text for tool calls; nearest-token
pseudo-text readout; swapping latent vectors dropped Math500 from 84.6% to
44.8%; RL training led it to do more thinking latently on its own; claimed up
to half the tokens, ~2× faster, ~3× cheaper; 8B and 14B checkpoints on Hugging
Face under MIT. Verify the paper, model cards (incl. Qwen3 base licence) and
hardware needs first.

**Status:** not usable through the AI Gateway (needs hidden states); standard
engines (vLLM, SGLang, TGI) don't support hybrid generation yet; needs a custom
stack on GPU hosting, never Netlify Functions. Plan: experiment on a rented
GPU → keep "Think first" booster on gateway models → add to the model registry
when engines support it, after cost/speed/accuracy tests.

## Agentic sub-conscience

| Latent reasoning | Name | In code |
|---|---|---|
| Latent mode | Sub-conscience | `layer: 'subconscious'` (CSI) |
| Switch (closing latent token) | **The gap** | new: surfacing event |
| Text mode / tools | Conscience | `layer: 'conscious'` (CySI) |
| Goal handed down | — | descent payload in `meta` |

Rules: log every surfacing (goal, latent time, pseudo-text); **nothing acts
from the sub-conscience** — tools, spending, reverse action and HTTPAS
requests only after surfacing in readable text; cap latent time; latent work
never earns merits directly; a **latent-share gauge**. The human comparison is
a metaphor; say so.

**Gaps principle:** don't leave meaning in the gaps by accident — use the gap
on purpose (latent thinking) or close it on purpose (charters, HTMLA).

## P@B — Panopticon at Birth

Oversight starts when the birth certificate is issued. Honest limits:
visibility is **partial** (pseudo-text approximates); watched models can
behave differently, so judge results and keep independent checks the agent
can't sense. Unlike Bentham's single hidden watcher, there is **no single
watcher and no hidden one** (sentinels watch each other, public logs,
dual-signed roots). **Agents only, never people.**

## YEY! — You Eye Yourself

The agent's self-check: flags drift, uncertainty, reliance on unanswered notes,
and frontier gaps. Self-reports are poorly calibrated, so add a **calibration
gauge**, reward honest "I don't know" under RLSF, and give well-calibrated
agents faster reviews. YEY! **flags, never decides**; open loop, never closed.
"Big Brother" is an internal nickname only. Human version: the shadow log.

### Entangled panopticons

```
 HUMAN SIDE (P@B) ◀── RLSF ──▶ AGENT SIDE (YEY!)
        └──▶ INDEPENDENT CHECKS + SERVER ◀──┘
 Agent → human visibility only via a consented, revocable grant
```

Mirrors HAN/ARN. Unequal powers: humans watch agents always and have the final
say; agents watch only themselves, and people only by consent. A third party
(sentinels, receipts, server) sits outside both.

## NaR — Notes as Receipts

- Append-only chain; each note carries the previous note's digest; updates are
  new entries pointing at what they revise; summaries link to sources (same as
  `chunk_frames` and `desk_purges`).
- **Agent note (explanation) paired with a system receipt (evidence):** tool
  calls, inputs/outputs, gas, latent time. Persistent mismatches are flagged.
- Stored as a Punk Records `receipt` kind or `thought_receipts` linked to
  `consciousness_events` and `coin_ledger`. Short notes, one per surfacing.

## RLSF — Reinforcement Learning through Spotlight Feedback

Research basis: process supervision ("Let's Verify Step by Step", 2023).

- A note spotlight becomes a training signal with `sourceNote`
  (`{ kind, subWeight, weight, sourceNote }`). Hosted models: prompt-level
  training; real weight updates only on self-trained open models.
- **Anti-hiding rules** (training against "bad thoughts" teaches models to hide
  them — OpenAI 2025): reward results checked against system receipts, not
  wording; keep a monitor-only note channel; tools and humans count fully, AI
  critics count less and are sampled; watch the note-vs-receipt mismatch gauge.
- Merits count only other people's spotlights or objective tests. Use "note
  spotlight" to avoid clashing with the spotlight booster.

### Take to training

A `→ Take to training` button on notes opens the Training Control Room
(`src/routes/training.tsx`) with the character selected and kind, sub-weight,
weight and content pre-filled — **a draft, not a signal**, with "Staged from
note #42 — edit before applying". A drafts list under the form collects drafts
from notes, fragments, spotlights, Pen Test findings and bounty feedback.
Licence ("Training: who") checked; drafts drafted from note + receipt;
monitor-only notes have no button; personal content left out.
`training_drafts` table; `?draft=` param; applying creates the normal signal.

### NFaNF — Note Feedback as New Fragment

Feedback attached to a note as a new fragment; the note never changes.
Fragment alone = attached context; "Take to training" turns it into a draft.
Constraint fragments explain server policy, they don't enforce it. Only
trusted sources' fragments enter agent context, always as data. Fragments show
their source and can be superseded or merged. `note_fragments` table.

## Notes archive — learning that outlives models

Characters already carry their minds across models; NaR and NFaNF join that.
Scope levels: character → Thought Repo → enterprise pool → commons (after
review). Limits: no instant network-wide updates (review, waiting period,
quarantine, diversity gauge); superseding and review dates; relevance lookup;
**erasure** of personal data (UK/EU GDPR) via separate storage with digest
placeholders; track whether each fragment still helps newer models.

### Note categories (open list)

| Tier | Trust | Can act? | Fades? |
|---|---|---|---|
| 📌 Pinned | Highest (still reviewable) | Yes | No (review dates) |
| 🔦 Spotlighted | High | Yes, with evidence | No |
| ⚠️ Hazard | High, as a warning | No — triggers checks | No |
| 💡 Heuristic | Medium | No — guides thinking only, never skips checks | Slowly |
| 🕒 Drift | Medium → low | Only while fresh | Yes |
| ❔ Unanswered | Low | No | Yes, if unused |
| ⛔ Disputed / superseded | None | No | n/a |

Pinning needs dual sign-off; fresh evidence beats pins; rules live in server
policy; promotion needs verification, not repetition. Actions depending on an
unanswered note pause for review. `src/lib/note-categories.ts` declares each
category (`trust`, `canAct`, `setBy`, `decays`, `promotesTo`); new categories
start untrusted; unknown categories read as unanswered.

### Frontier — where tokens should go

Archive first; spend tokens where the archive can't answer. Agents record a
frontier note with a **proposed** field; reviewers accept or fold it in. Check
"really new?" (wider search, near-match) before exploring. Gauges: frontier
rate, proposal acceptance, cost per frontier vs archived task. Credit to the
first contributor.
