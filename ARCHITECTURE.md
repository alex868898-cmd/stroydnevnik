# ARCHITECTURE.md — Local AI Video Orchestration Platform

## 0. Architectural stance

This system is a **local orchestration platform**, not an inference engine. All video/avatar generation compute happens on external provider infrastructure. Clean architecture, four layers, dependencies point inward:

```
presentation  →  application  →  domain  ←  infrastructure
```

- **domain** has zero framework/provider dependencies.
- **application** orchestrates domain use cases, depends only on domain + ports.
- **infrastructure** implements ports (DB, filesystem, HTTP clients to providers, scheduler).
- **presentation** (HTTP API + browser UI) depends on application only.

**Hard rule: the browser UI never calls a provider API directly**, and the browser UI never contains provider-specific business logic (see §12 for how this is enforced, not just stated).

**MVP note:** the architecture below is the full target design (used from day one), but the *implementation* covers only text-to-video against one real provider + the mock provider in MVP. The design is intentionally sized for the full scope so that adding image-to-video, a second provider, and avatar later does not require restructuring — only additive changes. See `implementation-plan.md` for sequencing.

---

## 1. Bounded contexts / modules

| Context | Responsibility | MVP status |
|---|---|---|
| **Job Orchestration** | Job lifecycle: create, submit, poll, retry, cancel, complete/fail. | Built in MVP, full lifecycle |
| **Provider Integration** | Adapter implementations per provider, capability declarations, normalization. | Built in MVP: Mock + 1 real adapter |
| **Asset Management** | Storing/retrieving/deleting generated files and metadata. | Built in MVP, basic (no filters) |
| **Preset Management** | CRUD for reusable named parameter sets. | Deferred to Phase 4; MVP has "rerun" only, no persisted preset entity |
| **Avatar Profile Management** | CRUD for avatar source assets used by the avatar use case. | Deferred to Phase 5 |
| **Provider Configuration** | Reading provider credentials/config, exposing capability info. | Built in MVP |
| **Settings** | Global app configuration. | Built in MVP, minimal fields |

---

## 2. High-level data flow

```
[Browser UI]
     │  REST/JSON — generic requests only, no provider awareness
     ▼
[Presentation layer: HTTP API]
     │
     ▼
[Application layer: use cases]
  - SubmitGenerationJob
  - PollJobStatus (scheduler-driven)
  - RetryJob
  - CancelJob
  - ListJobs / ListAssets
     │
     ▼
[Domain layer: entities + ports]
  GenerationJob, GenerationRequest, JobStatus, AssetReference,
  ProviderCapabilityContract
  + ports: ProviderAdapter, JobRepository, AssetStorage, AssetRepository
     │
     ▼
[Infrastructure layer]
  - ProviderRegistry + concrete ProviderAdapter implementations
  - SQLite JobRepository / AssetRepository
  - Local filesystem AssetStorage
  - JobScheduler (polling loop)
     │
     ▼
[External provider APIs] (MVP: 1 real provider + mock; Phase 3 adds a 2nd)
```

---

## 3. Core domain entities

### `GenerationRequest`
Immutable value object: use case type (MVP: only `text-to-video`; `image-to-video`/`avatar` values reserved in the enum for forward compatibility but unreachable via UI until their phase), prompt, provider id, pipeline/model id, params (duration, aspect ratio, seed), preset id (nullable, unused until Phase 4).

### `GenerationJob`
Aggregate root wrapping a `GenerationRequest` with runtime state: `id`, `status: JobStatus`, timestamps, `providerId`, `providerJobId`, `attempts`, `lastError`, `resultAssetId`, `progress` (optional).

### `JobStatus`
Enum: `queued → submitted → processing → succeeded | failed | cancelled`, with `retrying` as a transient sub-state.

### `AssetReference`
`id`, `path`, `mimeType`, `sizeBytes`, `sourceJobId` (nullable), `createdAt`, `kind` (`upload` | `generated`).

### `AvatarProfile` — **defined in domain model now, implemented in Phase 5**
Kept as a named type in the domain layer so `GenerationRequest`'s use-case enum and the provider capability contract have a stable shape to extend into later, but no repository, no CRUD, no UI in MVP. This avoids a breaking schema change later without building unused UI now.

---

## 4. Provider abstraction layer (refined)

This is the part of the system the whole design exists to protect. It has two goals: (1) let the application layer stay 100% provider-agnostic, and (2) let the frontend stay 100% provider-agnostic too — the second goal was underspecified in the previous revision and is made explicit here.

### 4.1 `ProviderAdapter` (port)

```
interface ProviderAdapter {
  id: string
  capabilities(): ProviderCapabilityContract
  submit(request: GenerationRequest): Promise<{ providerJobId: string }>
  poll(providerJobId: string): Promise<NormalizedProviderStatus>
  cancel(providerJobId: string): Promise<CancelResult>   // may resolve "unsupported"
}
```

Every concrete provider (MVP: one real adapter, e.g. `KlingProviderAdapter`, plus `MockProviderAdapter`) implements this. All provider-specific HTTP calls, auth headers, and response shapes live **only** inside the adapter's own file(s) in `infrastructure/providers/{name}/`.

### 4.2 `ProviderCapabilityContract` — the frontend/backend contract

This is the mechanism that keeps the frontend provider-agnostic. It is **served by the backend as data**, not hardcoded per provider in the frontend:

```
ProviderCapabilityContract {
  providerId: string
  displayName: string
  supportedUseCases: UseCase[]              // MVP: ["text-to-video"]
  paramSchema: {
    duration: { min: number, max: number, step?: number }
    aspectRatios: string[]                  // e.g. ["16:9", "9:16", "1:1"]
    supportsSeed: boolean
  }
  supportsCancel: boolean
  supportsProgressReporting: boolean
}
```

**Rule (enforced, not just documented):** the frontend's generation form is rendered by reading this contract for the currently selected provider and building inputs from `paramSchema` — it does not contain a hardcoded `if (providerId === 'kling') { ... }` anywhere. If a future provider needs a param shape this schema can't express, the schema is extended (new optional field), not bypassed with frontend-side special-casing. This rule is restated in `PROJECTRULES.md` §5 and is a mandatory review checklist item in `CLAUDE.md`.

**MVP simplification note:** with only one real provider in MVP, this contract-driven rendering is easy to accidentally skip ("just hardcode the one provider's fields, we'll fix it later"). This is explicitly disallowed — building the dynamic form against the contract from day one, even for a single provider, is what makes Phase 3 (second provider) not require a frontend rewrite. This is called out again in `CLAUDE.md` guardrails.

### 4.3 `ProviderRegistry`

Runtime registry of enabled `ProviderAdapter` instances, built at backend startup from config (which providers have credentials + are enabled). Application layer asks the registry for "the adapter for provider X" or "adapters supporting use case Y" — it never imports a concrete provider module.

### 4.4 Error taxonomy (new in this revision)

Adapters must translate provider-specific errors into one of these normalized categories before they reach the application layer:

| Normalized error | Meaning | Typical handling |
|---|---|---|
| `AuthError` | Invalid/expired credentials | Job fails immediately, no retry, surfaced clearly ("check provider API key") |
| `RateLimitError` | Provider rate limit hit | Retry with backoff (longer than default) |
| `ValidationError` | Request rejected by provider (bad params) | Job fails immediately, no retry — this is a request-shape bug, not transient |
| `TransientError` | Timeout, 5xx, network error | Retry with standard backoff |
| `UnsupportedOperationError` | e.g. cancel not supported | Not a failure — handled per §4.5 |

This taxonomy lives in `domain/providers/ProviderError.ts` as a shared type; adapters map their own error responses onto it. This keeps retry/backoff logic in the application layer generic instead of re-implemented per adapter.

### 4.5 Cancel semantics

`ProviderCapabilityContract.supportsCancel` tells the UI and the `CancelJobUseCase` whether a remote cancel is possible:
- `true`: adapter's `cancel()` is called; provider actually stops the job.
- `false`: local-only cancel — polling stops, job marked `cancelled` locally, and the UI must show a distinct message ("stopped locally; provider may still complete and may still bill for it") rather than implying the remote job was stopped. This distinction was implicit before; it's now a required UI state, not optional polish.

---

## 5. Job lifecycle — detailed flows

### 5.1 Submit generation job
1. Presentation receives `POST /jobs` with a `GenerationRequest` payload.
2. `SubmitGenerationJobUseCase` validates request against the target provider's `ProviderCapabilityContract` (duration/aspect-ratio/use-case support).
3. Persists new `GenerationJob`, status `queued`.
4. Enqueues to `JobScheduler`.
5. Scheduler (respecting concurrency limit) calls `ProviderAdapter.submit()`, stores `providerJobId`, sets status `submitted`.
6. Returns job id to UI immediately (async).

### 5.2 Poll external provider
1. Scheduler polls all `submitted`/`processing` jobs at the configured interval.
2. Calls `ProviderAdapter.poll(providerJobId)` → `NormalizedProviderStatus`.
3. On `succeeded`: downloads result, validates it, stores via `AssetStorage`, creates `AssetReference`, sets job `succeeded`.
4. On `failed`: maps to an error from §4.4; sets `lastError`, triggers retry if the error category is retryable and attempts remain.
5. On `processing`: updates `progress` if available.

### 5.3 Retry failed job
1. Only errors categorized `RateLimitError`/`TransientError` (§4.4) trigger automatic retry.
2. `AuthError`/`ValidationError` fail immediately, no automatic retry (retrying a bad request or bad credentials wastes provider calls and money).
3. Backoff is configurable (exponential by default).
4. On exhausted attempts, job stays `failed`; user can manually "rerun" (creates a *new* `GenerationJob`, not a retry of the old one).

### 5.4 Cancel queued / running job
1. `queued` (not yet submitted): removed from scheduler, marked `cancelled`, no provider call.
2. `submitted`/`processing`: behavior per §4.5 (`supportsCancel` true/false).

### 5.5 Normalize provider-specific responses
Normalization logic lives inside each adapter (infrastructure layer). Application/domain only ever see `NormalizedProviderStatus` and the error taxonomy from §4.4.

### 5.6 Store provider outputs in local asset library
1. On `succeeded`, application downloads the result (via adapter or a shared `AssetDownloader` infra service).
2. File validated (mime type, size) before write.
3. `AssetStorage.save()` writes under `assets/generated/{jobId}/{filename}`.
4. `AssetRepository` persists `AssetReference`, linked to `sourceJobId`.
5. History/asset library UI reads only from `AssetRepository`/`AssetStorage`, never from providers.

---

## 6. Storage zones

| Zone | Contents | Backing |
|---|---|---|
| `data/db/app.sqlite` | Jobs, assets metadata, (later) presets, (later) avatar profiles, provider config refs | SQLite |
| `data/assets/uploads/` | User-uploaded inputs — unused by text-to-video, present for Phase 3+ | Local filesystem |
| `data/assets/generated/{jobId}/` | Provider outputs | Local filesystem |
| `.env` | Provider API keys | Filesystem, gitignored |
| Provider config (non-secret) | Enabled flags, base URL overrides | SQLite table or config file |

`AssetStorage` is a port so local filesystem can later be swapped for S3/MinIO — **not built in MVP, kept possible.**

---

## 7. Configuration model

- **Secrets**: `.env` only, read once at startup into an in-memory config object by the single `ConfigService` — no other module reads `process.env`.
- **Non-secret provider config**: enabled/disabled, base URL overrides — editable via Providers screen.
- **App settings**: concurrency, polling interval, storage root — editable via Settings screen.

---

## 8. Provider abstraction — extension points (how Phase 3's second provider gets added)

1. Implement `ProviderAdapter` in `infrastructure/providers/{providerName}/`.
2. Declare its `ProviderCapabilityContract`.
3. Map its errors onto the taxonomy in §4.4.
4. Register it in `ProviderRegistry` bootstrap (config-driven).
5. Add its secret key to `.env.example`.

**No change required in:** domain entities, application use cases, or any frontend component — the generation form already renders from `ProviderCapabilityContract`. This is the concrete test of whether the abstraction actually works, and it is why Phase 3 requires a second real provider before the abstraction is considered validated (see `implementation-plan.md`).

---

## 9. Job scheduling / worker model

- Single in-process worker pool, no external broker (`ASSUMPTION`, unchanged from prior revision).
- Concurrency limit configurable (default 2).
- On startup: resume polling/submission for all non-terminal jobs from SQLite.
- Polling interval configurable globally.

---

## 10. Explicit non-goals for this architecture

- No message broker / distributed queue.
- No multi-agent decision-making layer.
- No auth/session layer in MVP.
- No horizontal scaling concerns.

---

## 11. What is deliberately over-built relative to MVP, and why

Two things are designed for the full target scope even though MVP only exercises a subset:
- **`ProviderCapabilityContract` and the contract-driven frontend form**, even with one provider — because retrofitting this after the frontend already has one-provider-specific code is a bigger rewrite than building it correctly once.
- **The `AvatarProfile` type reserved in the domain enum**, without any implementation — because it costs nothing now and avoids a breaking schema change in Phase 5.

Everything else (image-to-video request handling, Preset entity, AvatarProfile repository/CRUD/UI, avatar-capable adapter, history filters) is genuinely deferred, not built early, per `implementation-plan.md`.

---

## 12. Frontend independence check (verification, not just a rule)

To confirm requirement "frontend must not depend on provider-specific logic," the following must hold and should be checked at each PR touching the frontend:

- [ ] No file under `frontend/src/` contains a provider id as a string literal used in an `if`/`switch` to change behavior (a provider id appearing only as a `<option>` label sourced from the API response is fine).
- [ ] The generation form's fields (duration, aspect ratio, seed toggle) are derived from `ProviderCapabilityContract` returned by `GET /providers/:id/capabilities` (or equivalent), not from a local constants file per provider.
- [ ] Adding the second provider in Phase 3 requires **zero** frontend code changes beyond what already happens automatically via the contract (this is the acceptance test for this rule, to be run at Phase 3 kickoff).
