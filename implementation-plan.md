# implementation-plan.md

**MVP boundary: end of Phase 2.** Everything through Phase 2 is the realistic MVP. Everything from Phase 3 onward is committed future scope, not MVP — see `PRD.md` §4 and `risks-and-anti-goals.md` §2 for what must *not* be pulled forward.

Each phase should end in a working, demoable state.

---

## Phase 0 — Docs and setup

**Goal:** repository exists, is structured, and boots to "hello world."

- [ ] Resolve open questions in `ASSUMPTIONS-AND-OPEN-QUESTIONS.md` that are marked "blocking Phase 1" (stack choice, storage choice, which real provider to integrate first).
- [ ] Repository scaffolding per `repository-structure.md`.
- [ ] `.env.example` created (placeholders for the mock provider and the chosen first real provider only — not all five originally mentioned providers).
- [ ] Backend boots, health-check endpoint, binds to `127.0.0.1`.
- [ ] Frontend boots, calls health-check, renders "connected".
- [ ] SQLite + migrations wired up (empty schema).
- [ ] `MockProviderAdapter` scaffolded (canned "succeeded" after a short delay).

**Exit criteria:** local dev command starts backend+frontend, health check green, empty DB schema exists.

---

## Phase 1 — Skeleton local app + job orchestration (mock provider only)

**Goal:** full job lifecycle proven end-to-end against the mock provider, for text-to-video only.

- [ ] Domain entities: `GenerationJob`, `GenerationRequest` (use case enum includes `text-to-video` as the only reachable value; `image-to-video`/`avatar` reserved, unreachable), `JobStatus`, `AssetReference`.
- [ ] Ports: `JobRepository`, `AssetStorage`, `AssetRepository`, `ProviderAdapter`.
- [ ] `ProviderRegistry` with `MockProviderAdapter` registered, exposing a `ProviderCapabilityContract`.
- [ ] Use cases: `SubmitGenerationJobUseCase`, `PollJobStatusUseCase`, `RetryJobUseCase`, `CancelJobUseCase`, `ListJobsUseCase`.
- [ ] `JobScheduler` (concurrency + polling interval configurable).
- [ ] SQLite `JobRepository`, local filesystem `AssetStorage`.
- [ ] REST API: `POST /jobs`, `GET /jobs`, `GET /jobs/:id`, `POST /jobs/:id/cancel`, `GET /providers/:id/capabilities`.
- [ ] UI: New Generation form **built from the capability contract** (not hardcoded), Job Queue screen with live status.
- [ ] Startup recovery: non-terminal jobs resume polling after restart.

**Exit criteria:** submit a mock text-to-video job, watch `queued → submitted → processing → succeeded`, see the (fake) asset, cancel a queued job. State survives a restart. Frontend contains zero mock-provider-specific logic — it already reads the mock's capability contract generically.

---

## Phase 2 — First real provider (MVP completion)

**Goal:** the same pipeline from Phase 1 works against a real external provider. **This is the MVP finish line.**

- [ ] `ConfigService` reading real credentials from `.env`.
- [ ] Providers screen: list configured providers (mock + real), enable/disable, show capability summary from the contract.
- [ ] Implement the first real adapter (name TBD — see open questions): submit, poll, cancel-if-supported, error mapping onto the taxonomy in `ARCHITECTURE.md` §4.4.
- [ ] Asset download step: fetch provider result, validate, store via `AssetStorage`.
- [ ] Error handling exercised against real failures (auth, rate limit, timeout) — confirm each maps to the right taxonomy category and gets the right retry behavior.
- [ ] Basic render history: chronological list (no filters yet), asset preview/download/delete.
- [ ] Rerun: resubmit a past job as new, editable before submit.
- [ ] Settings screen: concurrency, polling interval, storage path.

**Exit criteria (= MVP done):** a user can generate a real text-to-video output through the real provider, see it in history, download it, rerun it with tweaks, and cancel/retry behave correctly — all through a UI that has zero hardcoded provider logic.

---

## Phase 3 — Second provider + image-to-video (post-MVP, abstraction validation)

**Goal:** prove the abstraction actually generalizes, and add the second originally-planned use case.

- [ ] Implement second real provider adapter.
- [ ] **Acceptance check:** integrating it requires zero frontend diffs beyond what the capability contract already renders (per `ARCHITECTURE.md` §12). If this fails, treat it as an architecture defect to fix before continuing, not a shipped feature.
- [ ] Image-to-video use case: extend `GenerationRequest` handling, add image upload + validation, extend the New Generation form (still contract-driven, now with an upload field gated by `supportedUseCases` from the contract).
- [ ] Job detail drill-down screen (full request/response metadata).
- [ ] Job progress percentage display where providers report it.

**Exit criteria:** two real providers work through the same UI/orchestration code; text-to-video and image-to-video both function; adding the second provider is demonstrably a backend-only change.

---

## Phase 4 — Presets and history usability

**Goal:** the app becomes pleasant for repeated use.

- [ ] `Preset` entity + repository + CRUD API + UI (separate from the Phase-2 "rerun" flow, which stays available too).
- [ ] History filters (provider, use case, status, date range) and search by prompt text.
- [ ] Basic cost/usage metadata display in job detail, if providers report it (still no billing system).

**Exit criteria:** a user doing repeated similar generations can do so via presets in a few clicks, and can find past output without scrolling a flat list.

---

## Phase 5 — Avatar workflows

**Goal:** talking-avatar use case — the largest deferred item from the original brief.

- [ ] `AvatarProfile` repository + CRUD API + UI screen (domain type already existed since Phase 1, per `ARCHITECTURE.md` §11).
- [ ] File upload handling for avatar source image/video and voice audio.
- [ ] Avatar-capable provider adapter, its own `ProviderCapabilityContract` entry declaring avatar support.
- [ ] New Generation form gains an avatar mode, still contract-driven (avatar-capable providers declare it via `supportedUseCases`).

**Exit criteria:** create an avatar profile, submit a talking-avatar job, get a result in the asset library — with the same orchestration code used for the other two use cases.

---

## Phase 6 — Polish and hardening

**Goal:** comfortable, safe for regular personal use.

- [ ] Structured logging review; confirm secret masking holds for every sensitive field actually in use across all three use cases.
- [ ] Input validation audit (uploads, form fields, path handling).
- [ ] Error states in UI are clear and honest (failed jobs, provider unreachable, disk full, local-only cancel warning per `ARCHITECTURE.md` §4.5).
- [ ] Performance pass with several concurrent polling jobs across use cases.
- [ ] Documentation pass: README, `.env.example` accuracy, architecture doc reflects any real deviations.

**Exit criteria:** the app is something the owner would use week to week without worrying about silent data loss, leaked secrets, or confusing failure states.

---

## Explicitly deferred beyond Phase 6

- Webhook-based status updates.
- TTS abstraction layer beyond provider-native TTS.
- Object storage (S3/MinIO) backend for assets.
- Multi-provider cost/billing dashboard.
- Any multi-user/auth system.
