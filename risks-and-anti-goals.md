# Risks and anti-goals

## 1. Major risks (ranked, MVP-relevant first)

| # | Risk | Why it matters | Mitigation |
|---|---|---|---|
| 1 | **Single real-provider "abstraction" doesn't actually generalize.** | Building `ProviderAdapter`/`ProviderCapabilityContract` around only one real provider risks over-fitting the interface to its quirks, invisibly, until it's expensive to fix. | Phase 3 requires a **second** real provider before the abstraction is called validated; the acceptance test is "zero frontend diffs" (`ARCHITECTURE.md` §12). This is the single highest-value risk mitigation in the whole plan. |
| 2 | **Frontend quietly absorbs provider-specific logic.** | Easiest failure mode in MVP: "just hardcode the one provider's fields, fix it later" — later rarely happens. | Contract-driven form is built from day one (Phase 1), even with only the mock provider; checked explicitly at every provider-touching PR (`PROJECTRULES.md` §5, `CLAUDE.md` §3). |
| 3 | **Long-running jobs vs backend restarts.** | If backend state isn't durable, a restart during a real (paid) generation could orphan it. | SQLite as source of truth + startup recovery/resume logic — Phase 1 requirement, not optional. |
| 4 | **Provider "cancel" is often unsupported or unreliable.** | Some providers can't actually stop a running job once submitted; user may be billed regardless. | `ProviderCapabilityContract.supportsCancel` flag; UI must distinguish "stopped locally" from "provider confirmed stopped" (`ARCHITECTURE.md` §4.5). |
| 5 | **Provider APIs are heterogeneous and can change without notice.** | Real provider integration (Phase 2) is the first point this becomes real, not hypothetical. | Isolate entirely inside the adapter + response mapper + error taxonomy; adapter tests against fixture responses. |
| 6 | **Secrets leakage.** | API keys for paid providers are high-value; a leak (logs, frontend bundle, git history) is costly. | Centralized config/logging with masking, `.env` gitignored, reviewed on every provider addition. |
| 7 | **Scope creep back toward the original 12-item MVP (or beyond, toward a full SaaS/editor).** | The original brief listed image-to-video, avatar, and presets as MVP; this revision deliberately deferred them. Pressure to "just add it back in" will recur. | This document + `PRD.md` §4 + `CLAUDE.md` §2.9 exist specifically to catch this; any such request should be flagged and resequenced, not quietly implemented. |
| 8 | **File upload abuse / path traversal.** | Even though MVP's only use case (text-to-video) has no upload, the validation utility is built in Phase 1 because Phase 3 needs it immediately — a rushed version here becomes a real risk once uploads are live. | `PROJECTRULES.md` §6: never build paths directly from user input; sanitize/resolve against a fixed base; content-type checked against actual bytes. |
| 9 | **Disk usage growth from generated video assets.** | Video files are large; local storage can fill up with no warning. | Settings-configurable storage path from Phase 2; usage visibility can wait until Phase 6, but the configurability cannot. |
| 10 | **No webhook support without a tunnel.** | Local app can't receive provider webhooks directly; polling is the only realistic MVP option. | Explicitly scoped as a limitation through Phase 6; not silently promised anywhere in the docs. |

## 2. What NOT to build in MVP (Phases 0–2)

This is the authoritative "not yet" list. If a task looks like it needs one of these, stop and flag it rather than building it:

- **Image-to-video use case** — Phase 3, not MVP, even though the original brief listed it as MVP item 2.
- **Talking avatar / AvatarProfile CRUD** — Phase 5, the largest deferred item; the domain *type* is reserved from Phase 1 but nothing else about it is built early.
- **Named, saved Presets as a separate entity** — Phase 4; MVP has "rerun a past job, edit before resubmit" only.
- **History filters/search** — Phase 4; MVP history is a flat chronological list.
- **A second real provider** — Phase 3; MVP ships with exactly one real provider plus the mock.
- **Authentication/login** — out of scope for the entire project per `PRD.md` non-goals, not just MVP.
- **A message broker (Redis/RabbitMQ/etc.)** — the in-process scheduler + SQLite is sufficient at this scale; adding a broker is unjustified complexity.
- **Webhook receivers** — requires a tunnel/public-endpoint decision not yet made; polling only through Phase 6.
- **Billing/cost dashboard** — only raw metadata capture (Phase 3+) is in scope; no dashboard, no budgets, ever, per current scope.
- **Multi-user/roles/permissions** — never in scope; repeated here because it's a common "just in case" addition to resist.
- **Any autonomous/multi-agent decision-making** in job routing or retries — retry/backoff is fixed, deterministic configuration.
- **Provider-specific frontend code, even temporarily** — use the mock provider or a fixture to unblock testing instead of hardcoding a real provider's shape into a component "just for now."

## 3. Why this is a realistic MVP (not just a smaller list)

The reduction isn't arbitrary trimming — each cut targets a specific overreach relative to "single-user local app, first working release":

- **One use case instead of three** removes ~60% of surface area (upload handling, avatar-specific UI, TTS/voice handling) while keeping the part that actually proves the architecture: job orchestration + provider abstraction.
- **One real provider, with a second required immediately after (Phase 3), not simultaneously** — sequencing, not skipping. The abstraction still gets validated against two real providers before anyone calls it "done"; it just doesn't block the first usable release.
- **Rerun instead of Presets** ships the same underlying value (avoid re-typing a full job) without a persisted, independently-managed entity, its own repository, and its own screen.
- **Flat history instead of filtered history** is a pure UI/query simplification with no architectural cost — filters are additive later.

Nothing here changes the original goal stated in `PRD.md` §2: a provider-agnostic local orchestration platform for AI video generation. It changes only what ships first.
