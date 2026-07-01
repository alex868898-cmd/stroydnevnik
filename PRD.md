# PRD.md — Local AI Video Orchestration Platform

## 0. Document status

**Revision 2.** This revision deliberately trims MVP scope compared to the original brief. The **original product goal is unchanged**: a local, single-user orchestration platform for external AI video/avatar generation providers. What changed is *sequencing* — which use cases and features ship in the first working release versus later phases.

See `ASSUMPTIONS-AND-OPEN-QUESTIONS.md` for the full, consolidated list of assumptions, open questions, and how they were resolved for this revision. See `risks-and-anti-goals.md` for major risks.

---

## 1. Product summary

A **single-user, local web application** that orchestrates external AI video generation providers (text-to-video first; image-to-video and talking avatar as planned, deliberately post-MVP expansions). The application does **not** perform video inference locally. It is a control plane: job orchestration, asset management, provider abstraction, and a browser UI.

The system is explicitly **not**:
- a SaaS product,
- a multi-user product,
- a public service,
- a multi-agent AI system,
- an inference engine.

---

## 2. Goals

- Provide one local UI to submit, monitor, and manage video generation jobs across external providers.
- Prove a genuine provider abstraction — not just a wrapper around one API — before expanding use cases.
- Normalize different provider capabilities and response formats into one consistent internal model.
- Keep a local history of every generation with its metadata (prompt, seed, provider, params, output).
- Allow adding/removing/disabling providers without touching UI code or core orchestration logic.
- Keep provider credentials strictly on the backend.

## 3. Non-goals (anti-goals)

- No local GPU/CPU video inference.
- No multi-user accounts, roles, or permissions.
- No public deployment / no auth hardening for internet exposure (local-only in MVP).
- No multi-agent / autonomous-agent orchestration.
- No billing/payment system.
- No mobile app.
- No real-time collaborative editing.
- **No feature volume for its own sake** — MVP is intentionally the smallest slice that proves the architecture end-to-end with real external providers, not the largest slice that fits in the timeline.

---

## 4. MVP boundary — what "MVP" means here

The original brief listed 12 capabilities as MVP (text-to-video, image-to-video, avatar, queue, history, asset library, presets, rerun, settings, provider management, provider-agnostic orchestration, rich metadata). Delivering all 12 at production quality in one pass is not realistic for a single-user local project and risks the architecture being validated only in theory.

**Decision (flagged as a scope decision, not silently applied):** MVP is redefined as the smallest release that:
1. proves the full job lifecycle (submit → poll → retry → cancel → store) against a **real** external provider, not just a mock,
2. proves the provider abstraction generalizes by including a **second** real provider before Phase-2 exit,
3. covers **one** generation use case end-to-end (text-to-video) rather than three,
4. defers image-to-video, talking avatar, saved presets, and rich history filtering to explicitly named later phases — they remain committed goals, just not MVP.

This mirrors the "reduced-scope fallback" from the previous revision, now promoted to the primary plan. Full target scope (all original 12 items) is still the destination — see `implementation-plan.md` for when each lands.

---

## 5. Primary user

A single technical user (the developer/owner) running the app locally, holding their own provider API keys, generating video content for personal/creative/professional use.

---

## 6. Core use cases

### UC-1: Text-to-video generation (MVP)
User writes a prompt, selects a provider + pipeline, sets params (duration, aspect ratio, seed if supported), submits a job, watches it progress in the queue, and gets a video in the asset library on completion.

### UC-2: Job queue monitoring (MVP)
User sees all active/queued/running jobs, their status, progress (if provider reports it), and can cancel a queued or running job.

### UC-3: Render history & asset library — basic (MVP)
User sees a simple list of past generations (successful and failed) in reverse-chronological order, can open/preview/download/delete an asset. **Filtering/search is not MVP** (see §8, deferred to Phase 4).

### UC-4: Rerun (MVP, simplified)
User takes a past job and resubmits it as a new job, optionally editing the prompt/params inline before submitting. **This is not a separate "Preset" entity in MVP** — no named, independently managed preset list. That is a deferred, explicitly named Phase-4 feature.

### UC-5: Provider management (MVP, simplified)
User configures provider credentials via backend `.env`, sees which providers are enabled, and which capabilities each declares. MVP requires the abstraction to work with **at least one real provider plus the mock provider**; a second real provider is required before the abstraction is considered validated (Phase 3 exit criterion, immediately after MVP).

### UC-6: Settings (MVP, minimal)
User configures: worker concurrency, polling interval, storage location. No per-use-case default provider setting in MVP (moot with one use case).

---

### Deferred use cases (post-MVP, still committed to the original goal)

### UC-7: Image-to-video generation — Phase 3
Same shape as UC-1 with an uploaded source image. Deferred so MVP stays to one use case; architecture already treats it as a sibling of text-to-video, so this is additive, not a redesign.

### UC-8: Digital avatar / talking avatar — Phase 5
Requires `AvatarProfile` (source image/video + voice) and its own CRUD screen, plus an avatar-capable provider adapter. This is the single largest deferred item — flagged explicitly as **not MVP** even though it was originally listed as MVP item 3.

### UC-9: Presets (named, saved parameter sets) — Phase 4
Full CRUD for reusable named presets, distinct from the simplified "rerun" flow in MVP.

### UC-10: Render history filters/search — Phase 4
Filter by provider/date/type/status, search by prompt text.

---

## 7. Primary screens

### MVP screens
1. **Dashboard / New Generation** — text-to-video form only.
2. **Job Queue** — active/queued/running jobs, cancel action.
3. **History / Asset Library (basic list)** — chronological list, preview/download/delete, "rerun" action per item.
4. **Providers** — list configured providers, capability summary, enable/disable.
5. **Settings** — concurrency, polling interval, storage path.

### Deferred screens
6. **Presets** — Phase 4.
7. **Avatar Profiles** — Phase 5.
8. **Job Detail** (full metadata drill-down) — Should have; include in MVP only if trivial, otherwise Phase 3 (see §8).

---

## 8. Functional requirements

### 8.1 Must have (MVP)

| ID | Requirement |
|---|---|
| F-01 | Submit text-to-video job to a selected provider |
| F-02 | Async job queue with status: `queued`, `submitted`, `processing`, `succeeded`, `failed`, `cancelled` |
| F-03 | Poll external provider for job status at a configurable interval |
| F-04 | Retry failed job submission/poll with backoff, up to a configurable max attempts |
| F-05 | Cancel a queued or in-flight job (best-effort; degrade gracefully when provider doesn't support remote cancel) |
| F-06 | Store completed asset locally with metadata (prompt, seed, duration, aspect ratio, provider, pipeline, timestamps) |
| F-07 | Basic render history: chronological list with status, no filters required |
| F-08 | Asset library: preview, download, delete asset + its metadata record |
| F-09 | Rerun a past job as a new job, editable before resubmit |
| F-10 | Provider management: list configured providers, show capability summary, enable/disable |
| F-11 | Provider credentials via backend `.env`, never exposed to frontend |
| F-12 | `.env.example` with placeholder keys, no real secrets committed |
| F-13 | Settings: worker concurrency, polling interval, storage location |
| F-14 | Provider adapter interface allowing a new provider to be added without UI/core changes |
| F-15 | Backend masks sensitive fields in all logs |
| F-16 | File upload validation for any job inputs used (not required for text-to-video itself, but the validation utility must exist since Phase 3 needs it immediately after) |
| F-17 | Frontend renders generation form fields (duration range, aspect ratio options, seed support) from a provider **capability contract** served by the backend — no provider-specific branching in frontend code (see §12) |
| F-18 | At least **one real provider** integrated and working end-to-end, in addition to the mock provider used in early development |

### 8.2 Should have (Phase 3 — immediately post-MVP)

| ID | Requirement |
|---|---|
| S-01 | Second real provider integrated (validates the abstraction actually generalizes) |
| S-02 | Image-to-video use case (UC-7) |
| S-03 | Job detail drill-down view (full request/response metadata) |
| S-04 | Job progress percentage display when provider reports it |
| S-05 | Basic cost/usage metadata capture per job, if provider returns it |

### 8.3 Nice to have (Phase 4+)

| ID | Requirement |
|---|---|
| N-01 | Named, saved Presets (UC-9) |
| N-02 | History filters/search (UC-10) |
| N-03 | Talking avatar use case + AvatarProfile CRUD (UC-8) — largest deferred item |
| N-04 | Webhook-based status updates via local tunnel |
| N-05 | Provider connection test / health check button |
| N-06 | Export job + asset bundle as a shareable folder/zip |
| N-07 | Text-to-speech integration for avatar script |
| N-08 | Tagging/favoriting assets |
| N-09 | Side-by-side comparison view for variations |

---

## 9. Non-functional requirements

- **Local-only**: backend binds to `127.0.0.1` by default.
- **Resilience**: backend restart must not lose track of in-flight jobs — state persisted (SQLite), polling resumed on startup for non-terminal jobs.
- **Extensibility**: adding a provider = implementing one adapter + registering it; no UI code changes required for the text-to-video use case.
- **Observability**: structured logs for job lifecycle transitions; secrets masked.
- **Data integrity**: every asset file on disk has a corresponding metadata record.
- **Performance**: UI stays responsive while jobs poll in background.
- **Portability**: single local start command; no cloud dependency required to boot.

---

## 10. Cross-references

- Assumptions and open questions: `ASSUMPTIONS-AND-OPEN-QUESTIONS.md`
- Major risks and anti-goals: `risks-and-anti-goals.md`
- Provider abstraction detail: `ARCHITECTURE.md` §3, §7
- Phase-by-phase delivery of deferred items: `implementation-plan.md`
