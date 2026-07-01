# PROJECTRULES.md — Naming, structure, and hygiene rules

## 1. Layer boundaries (non-negotiable)

```
presentation/   → may import: application
application/    → may import: domain
domain/         → may import: nothing outside domain (no framework, no infra, no provider SDKs)
infrastructure/ → may import: domain (implements its ports), application (wired in at bootstrap)
```

`infrastructure` implements interfaces defined in `domain`. `application` never imports a concrete class from `infrastructure` directly — only through dependency injection at the composition root.

## 2. Folder rules

- One bounded context = one top-level folder inside each layer: `jobs/`, `providers/`, `assets/`.
- Contexts not yet implemented in MVP (`presets/`, `avatarProfiles/`) may exist as empty/stub folders with a `README.md` noting "Phase 4"/"Phase 5 — not implemented yet," but should not accumulate unused code ahead of their phase.
- Provider-specific code lives **only** under `infrastructure/providers/{providerName}/`.
- `shared/`/`common/` stays small and genuinely shared; split by concern if it grows into a dumping ground.

## 3. Naming rules

- **Entities/domain types**: PascalCase, singular nouns (`GenerationJob`, `AssetReference`).
- **Use cases**: PascalCase, verb-first, suffixed `UseCase` (`SubmitGenerationJobUseCase`).
- **Ports/interfaces**: PascalCase, no `I` prefix (`ProviderAdapter`, `JobRepository`, `AssetStorage`).
- **Infrastructure implementations**: PascalCase, technology/provider-prefixed (`SqliteJobRepository`, `KlingProviderAdapter`).
- **Files**: match the primary exported symbol, one primary export per file.
- **API routes**: REST nouns, plural resources (`/jobs`, `/assets`, `/providers`).
- No non-standard abbreviations. `providerJobId`, not `pjid`.

## 4. File size philosophy

- File exceeding **~300 lines** → look for a split.
- Function exceeding **~50 lines** → extract helpers.
- React component exceeding **~200 lines** → split into subcomponents/hooks.
- No god objects — no single class/module spanning jobs + providers + assets at once.
- Adapter files may run longer for response mapping, but extract non-trivial mapping into its own file (e.g. `KlingResponseMapper.ts`).

## 5. Separation of concerns — including frontend/provider independence (expanded)

- Domain-rule validation lives in `application`/`domain`, not controllers, not adapters.
- Input-shape validation lives in `presentation`.
- Provider response parsing/normalization lives only in the corresponding adapter.
- **Frontend provider independence (mandatory, verified per `ARCHITECTURE.md` §12):**
  - No frontend file branches behavior on a provider id (`if (providerId === 'kling')`) to decide what fields to show or what limits to enforce.
  - The generation form is built by reading `ProviderCapabilityContract` (duration range, aspect ratios, seed support, use-case support) returned by the backend for the selected provider — the frontend has no local, hardcoded copy of any provider's limits.
  - Displaying a provider's name/logo/id as a label is fine; using it to branch logic is not.
  - If a provider needs a capability the current contract schema can't express, the schema gains a new optional field (backend + shared type change) — the frontend consumes it generically, it does not gain a special case for that provider.
  - This rule is checked explicitly whenever the frontend or a provider adapter changes (see `CLAUDE.md` §4 checklist).
- Scheduling/polling logic lives in one dedicated infrastructure module (`JobScheduler.ts`), not scattered across use cases.
- Provider error mapping (raw provider error → taxonomy in `ARCHITECTURE.md` §4.4) lives inside the adapter; application-layer retry logic only ever sees the normalized taxonomy.

## 6. Security rules

- All secrets: `.env` only, gitignored. `.env.example` has placeholders, never real keys.
- No secret value in logs, API responses, error messages, frontend bundle, or committed config.
- Logging masks fields matching `key`/`token`/`secret`/`password`/`authorization` centrally, in the logger setup.
- All file uploads validated: whitelisted mime types, max size, content-type checked against actual bytes (not just the declared extension).
- User-derived filenames/ids never build filesystem paths directly — always sanitized/resolved against a fixed base directory; reject path traversal.
- Provider API calls only from `infrastructure/providers/`.
- Backend binds to `127.0.0.1` by default; `0.0.0.0` requires explicit opt-in and a logged warning that auth isn't implemented.

## 7. Dependency hygiene

- New dependencies require a one-line justification in the commit/PR message.
- Prefer one well-maintained library per job (HTTP client, validation, ORM) instead of duplicating.
- Provider SDK types (if a provider ships one) stay isolated to that provider's adapter folder — never leak into domain/application signatures.

## 8. Refactoring rules

- Refactors touching layer boundaries are called out explicitly as "architecture change," not folded into a feature change.
- Splitting a file per §4 keeps the public interface stable unless the task is specifically about changing that interface.
- Dead code is removed, not commented out.
- Any TODO left in code is surfaced in the change summary (`CLAUDE.md` §5), not left silent.

## 9. Testing expectations (baseline)

- Domain entities and use cases: unit tests with fakes/mocks for ports — no real HTTP calls.
- Provider adapters: unit tests against recorded/fixture responses; `MockProviderAdapter` used for local end-to-end flows.
- Job lifecycle (submit → poll → succeed/fail → retry/cancel) has at least one integration-style test per transition using the mock provider.
- **Phase 3 acceptance test:** adding the second real provider must pass with zero frontend diffs beyond what the capability contract already renders generically — this is a testable, not just documented, requirement.
