# ASSUMPTIONS-AND-OPEN-QUESTIONS.md

Single source of truth for everything assumed vs. still genuinely open. Every other document cross-references this file instead of restating assumptions inline at length.

---

## 1. Assumptions made in this revision (defaults chosen so work can start)

These are defaults, not final decisions — override any of them explicitly before the relevant phase starts.

| # | Assumption | Affects | Confidence |
|---|---|---|---|
| A-1 | Backend: Node.js + TypeScript. Frontend: React + TypeScript. | Everything in `repository-structure.md` | Medium — common default, not confirmed by user |
| A-2 | Metadata storage: SQLite via an ORM (Prisma/Drizzle), not Postgres. | `ARCHITECTURE.md` §6, all repositories | High — clearly right for single-user local |
| A-3 | Asset storage: local filesystem behind an `AssetStorage` port (not S3/MinIO in MVP). | `ARCHITECTURE.md` §6 | High |
| A-4 | No authentication in MVP; backend binds to `127.0.0.1` only. | `PRD.md` §3, `PROJECTRULES.md` §6 | High — matches explicit "single-user local" brief |
| A-5 | Polling only, no webhooks, through at least Phase 6. | `ARCHITECTURE.md` §5.2 | High — no public endpoint available without a tunnel |
| A-6 | In-process scheduler, no external message broker. | `ARCHITECTURE.md` §9 | High — unjustified complexity otherwise |
| A-7 | MVP ships with exactly **one** real provider (name TBD — see open question Q-1) plus the mock provider; a second real provider is required in Phase 3, not MVP. | `PRD.md` §4, `implementation-plan.md` Phase 2/3 | **New in this revision** — this is a scope decision, confirm before Phase 0 closes |
| A-8 | MVP covers **text-to-video only**; image-to-video and avatar are deferred to Phase 3 and Phase 5 respectively. | `PRD.md` §4, §6 | **New in this revision** — scope decision, confirm |
| A-9 | No named/saved Preset entity in MVP; "rerun a past job, edit before resubmit" substitutes for it. | `PRD.md` §6 UC-4 | **New in this revision** |
| A-10 | Render history has no filters/search in MVP — flat chronological list only. | `PRD.md` §7 | **New in this revision** |
| A-11 | Frontend generation form is built dynamically from a backend-served `ProviderCapabilityContract`, even with only one provider in MVP — not hardcoded per provider. | `ARCHITECTURE.md` §4.2, §12 | High — required for requirement "frontend has no provider-specific logic" |
| A-12 | `AvatarProfile` exists as a reserved domain type from Phase 1 but has no repository/CRUD/UI until Phase 5. | `ARCHITECTURE.md` §3, §11 | Medium — deliberate forward-compatibility choice, cheap to keep |
| A-13 | Concurrency default: 2 parallel jobs. Polling interval default: ~10s. Both configurable. | `PRD.md` §8, `ARCHITECTURE.md` §9 | Low — arbitrary defaults, easy to change |
| A-14 | Avatar voice handling (when Phase 5 arrives) will support uploaded audio and/or provider-native TTS only — no separate TTS abstraction layer. | Phase 5 scope | Medium |

---

## 2. Open questions — blocking (should be resolved before Phase 0 closes)

| # | Question | Why it blocks | Suggested way to resolve |
|---|---|---|---|
| Q-1 | **Which single provider is the MVP's real provider (Phase 2)?** Kling, Runway, Luma, Sora-like, or something else? | Phase 2 can't start without a concrete adapter to build; `.env.example` needs a real key name. | Pick based on: API stability/docs quality, whether it has a sane polling-based status endpoint (not webhook-only), and pricing for personal testing volume. |
| Q-2 | **Which second provider for Phase 3?** | Needed to actually schedule and staff Phase 3; also determines whether the capability contract needs any new optional fields sooner than expected. | Pick a provider with *meaningfully different* param constraints (e.g. different aspect-ratio support, no seed support) from Q-1's choice — this is what actually stress-tests the abstraction, a near-identical second provider proves less. |
| Q-3 | **Confirm stack (A-1) and storage (A-2/A-3) assumptions**, or override with a different language/framework preference. | Affects every file in `repository-structure.md`; better to fix before Phase 0 scaffolding. | Direct confirmation from the project owner. |

## 3. Open questions — non-blocking (can be resolved during the relevant phase)

| # | Question | Relevant phase |
|---|---|---|
| Q-4 | Job progress percentage: does the chosen Phase-2 provider report it at all, or is `progress` always null until a provider that supports it is added? | Phase 2 |
| Q-5 | Should basic cost/usage metadata capture (if a provider returns it) be part of Phase 2, or wait for Phase 3/4? | Phase 2–4 |
| Q-6 | For Phase 3's image-to-video: does the second provider chosen in Q-2 support image-to-video, or does that require a third provider? | Phase 3 |
| Q-7 | For Phase 5 avatar: which provider will be the avatar-capable one — same family as HeyGen, or something else? Does it support programmatic TTS or audio-upload only? | Phase 5 |
| Q-8 | Docker vs. plain local Node process for running the app — does the owner want a `docker compose up` option, or is a plain `npm run dev` sufficient? | Phase 0–1 |
| Q-9 | Any preference on ORM (Prisma vs Drizzle vs raw SQL) for the SQLite layer? | Phase 1 |

---

## 4. How this file is used

- `CLAUDE.md` requires the agent to read this file before starting work and to add new assumptions/open questions here rather than leaving them implicit in code or comments.
- Blocking questions (§2) should be closed before their named phase starts; non-blocking ones (§3) can ride along and be closed opportunistically.
- When a question is resolved, move it here into a "Resolved" log (create one once the first question is closed) rather than deleting it, so the reasoning is preserved for Antigravity/future contributors.
