# CLAUDE.md — Engineering guardrails for the AI IDE / Antigravity agent

This file governs how an AI coding agent (Antigravity or similar) should work on this repository. It is read before any implementation work. If any instruction here conflicts with a task request, this file wins unless the human explicitly overrides it in writing for that specific task.

## 1. Ground truth documents

Before writing any code, the agent must have read:
- `PRD.md` — what we're building and why, including the current MVP boundary (§4)
- `ARCHITECTURE.md` — how it's structured, including the provider abstraction (§4) and frontend independence check (§12)
- `PROJECTRULES.md` — how code is organized/named
- `implementation-plan.md` — what phase we're in and what's in scope right now
- `ASSUMPTIONS-AND-OPEN-QUESTIONS.md` — what's assumed vs. still open
- `risks-and-anti-goals.md` — what NOT to build yet

If a task seems to require something not covered by these documents, **stop and ask** rather than inventing scope.

## 2. Core working rules

1. **Plan before code.** For any non-trivial change, produce a short written plan first: what files will be touched/created, what interfaces will change, what the smallest safe increment is.
2. **Small steps.** Prefer several small, reviewable changes over one large change.
3. **Do not break the architecture.** `presentation` never calls `infrastructure`/providers directly. `domain` never imports `infrastructure`/`presentation`.
4. **No god objects, no giant files.** See `PROJECTRULES.md` for size limits.
5. **No hidden/invented dependencies.** Don't add a library or assume an undocumented provider API shape without flagging it.
6. **Provider abstraction is sacred.** All provider-specific logic lives only in that provider's adapter folder.
7. **Secrets discipline.** `.env` only; never log, return, or bundle a raw secret.
8. **No multi-agent orchestration.** Job orchestration is a deterministic state machine.
9. **Respect the MVP boundary.** Check `PRD.md` §4 and `implementation-plan.md` before adding anything from the deferred list (image-to-video, avatar, named Presets, history filters — see `risks-and-anti-goals.md` §2 for the full "not yet" list). Building a deferred feature "since it's easy while I'm in this file" is exactly the failure mode this document exists to prevent.
10. **Checkpoint via git.** Small, working, clearly-messaged commits.

## 3. Provider-abstraction-specific guardrails (new in this revision)

- **Never hardcode a provider's parameter limits or field list in frontend code.** The generation form must be built from `ProviderCapabilityContract` (see `ARCHITECTURE.md` §4.2, §12). If a task seems to require a provider-specific frontend branch, that's a signal the contract schema needs a field added — extend the schema, don't special-case the frontend.
- **Never let a second provider's integration touch the frontend.** When Phase 3 adds the second real provider, run the acceptance check in `ARCHITECTURE.md` §12 before considering the task done: if any frontend file needed to change to support it, stop and report that as an architecture violation, not a shipped feature.
- **Map every provider error to the taxonomy in `ARCHITECTURE.md` §4.4** (`AuthError`, `RateLimitError`, `ValidationError`, `TransientError`, `UnsupportedOperationError`) inside the adapter. Do not let raw provider error shapes leak into application-layer retry logic.
- **`AvatarProfile` exists only as a reserved domain type until Phase 5.** Do not build its repository, CRUD endpoints, or UI screen before Phase 5 is actually started, even though the type exists in the domain layer.

## 4. Before making a change — checklist

- [ ] Have I read the relevant section of `ARCHITECTURE.md` for this area?
- [ ] Does this change stay inside one architectural layer, or have I planned each layer's change separately?
- [ ] Am I introducing a file that will start above the `PROJECTRULES.md` size limits? Split the plan now if so.
- [ ] Does this touch provider adapters? Is all provider-specific logic contained inside the adapter, including error mapping?
- [ ] Does this touch the frontend generation form? Does it still derive fields from the capability contract, with zero provider-id branching?
- [ ] Does this touch secrets/config/logging? Re-check masking and `.env.example`.
- [ ] Is this in scope for the current implementation phase, per `implementation-plan.md`? If it's on the deferred list, stop and flag it instead of building it.

## 5. After making a change

- Summarize what changed and why, in terms of the architecture (which layer, which module).
- Call out any deviation from the plan and why it was necessary.
- Call out any new open question or assumption introduced — add it to `ASSUMPTIONS-AND-OPEN-QUESTIONS.md` rather than leaving it implicit in code comments.
- Note any follow-up cleanup needed.

## 6. Things this agent must never do in this repository

- Never call a provider API from frontend code.
- Never commit real secrets, tokens, or `.env` contents.
- Never introduce a second source of truth for job state.
- Never silently expand MVP scope — check `risks-and-anti-goals.md` §2 first.
- Never remove or weaken the provider abstraction "to make one provider work faster."
- Never hardcode provider-specific UI behavior, even temporarily "to unblock testing" — use the mock provider or a fixture instead.
- Never assume undocumented provider behavior — mark it as an assumption in `ASSUMPTIONS-AND-OPEN-QUESTIONS.md` or ask.

## 7. Communication style expected from the agent

- Be explicit about uncertainty; mark assumptions rather than silently choosing.
- Use the repo's named entities (`GenerationJob`, `ProviderAdapter`, `ProviderCapabilityContract`, `AssetReference`, etc.) rather than vague descriptions.
- When scope looks too large for the requested step, say so and propose a smaller first step.
