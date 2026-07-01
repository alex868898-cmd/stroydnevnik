# Repository structure

`ASSUMPTION:` Node.js/TypeScript backend + React/TypeScript frontend, monorepo with two workspaces (see `ASSUMPTIONS-AND-OPEN-QUESTIONS.md`). Internal layer structure stays valid regardless of the final stack choice.

Folders marked `(stub — Phase N)` should exist only as a placeholder with a short `README.md` noting when they become real; they should not accumulate implementation code before their phase per `PROJECTRULES.md` §2.

```
/
├── PRD.md
├── ARCHITECTURE.md
├── CLAUDE.md
├── PROJECTRULES.md
├── implementation-plan.md
├── ASSUMPTIONS-AND-OPEN-QUESTIONS.md
├── risks-and-anti-goals.md
├── README.md
├── .env.example
├── .gitignore
│
├── backend/
│   ├── src/
│   │   ├── presentation/
│   │   │   ├── http/
│   │   │   │   ├── jobs/
│   │   │   │   │   ├── JobsController.ts
│   │   │   │   │   └── jobs.routes.ts
│   │   │   │   ├── assets/
│   │   │   │   ├── providers/
│   │   │   │   ├── settings/
│   │   │   │   ├── presets/            # (stub — Phase 4)
│   │   │   │   ├── avatarProfiles/     # (stub — Phase 5)
│   │   │   │   └── server.ts
│   │   │   └── dto/
│   │   │
│   │   ├── application/
│   │   │   ├── jobs/
│   │   │   │   ├── SubmitGenerationJobUseCase.ts
│   │   │   │   ├── PollJobStatusUseCase.ts
│   │   │   │   ├── RetryJobUseCase.ts
│   │   │   │   ├── CancelJobUseCase.ts
│   │   │   │   └── ListJobsUseCase.ts
│   │   │   ├── assets/
│   │   │   ├── providers/
│   │   │   │   └── GetProviderCapabilitiesUseCase.ts
│   │   │   ├── presets/                # (stub — Phase 4)
│   │   │   └── avatarProfiles/         # (stub — Phase 5)
│   │   │
│   │   ├── domain/
│   │   │   ├── jobs/
│   │   │   │   ├── GenerationJob.ts
│   │   │   │   ├── GenerationRequest.ts   # use-case enum includes reserved future values
│   │   │   │   ├── JobStatus.ts
│   │   │   │   └── ports/
│   │   │   │       └── JobRepository.ts
│   │   │   ├── assets/
│   │   │   │   ├── AssetReference.ts
│   │   │   │   └── ports/
│   │   │   │       ├── AssetStorage.ts
│   │   │   │       └── AssetRepository.ts
│   │   │   ├── avatarProfiles/
│   │   │   │   └── AvatarProfile.ts    # type reserved from Phase 1, unused until Phase 5
│   │   │   ├── presets/                # (stub — Phase 4)
│   │   │   └── providers/
│   │   │       ├── ProviderAdapter.ts          # port
│   │   │       ├── ProviderCapabilityContract.ts
│   │   │       ├── ProviderError.ts            # normalized error taxonomy
│   │   │       └── ProviderRegistry.ts
│   │   │
│   │   ├── infrastructure/
│   │   │   ├── providers/
│   │   │   │   ├── mock/
│   │   │   │   │   └── MockProviderAdapter.ts
│   │   │   │   └── {first-real-provider}/      # MVP: exactly one real adapter
│   │   │   │       ├── {Provider}ProviderAdapter.ts
│   │   │   │       └── {Provider}ResponseMapper.ts
│   │   │   ├── persistence/
│   │   │   │   └── sqlite/
│   │   │   │       ├── SqliteJobRepository.ts
│   │   │   │       ├── SqliteAssetRepository.ts
│   │   │   │       └── migrations/
│   │   │   ├── storage/
│   │   │   │   └── LocalFilesystemAssetStorage.ts
│   │   │   ├── scheduler/
│   │   │   │   └── JobScheduler.ts
│   │   │   ├── config/
│   │   │   │   └── ConfigService.ts    # only module reading process.env
│   │   │   └── logging/
│   │   │       └── Logger.ts           # central secret-masking logic
│   │   │
│   │   └── bootstrap/
│   │       └── composition-root.ts     # wires ports to implementations, builds ProviderRegistry
│   │
│   ├── test/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   │
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard/          # MVP: text-to-video form only, contract-driven
│   │   │   ├── JobQueue/
│   │   │   ├── History/            # MVP: flat list, no filters
│   │   │   ├── Providers/
│   │   │   ├── Settings/
│   │   │   ├── Presets/            # (stub — Phase 4)
│   │   │   └── AvatarProfiles/     # (stub — Phase 5)
│   │   ├── components/
│   │   │   └── GenerationForm/     # renders fields from ProviderCapabilityContract — no per-provider code
│   │   ├── api/                    # thin HTTP client to local backend only
│   │   ├── hooks/
│   │   └── app.tsx
│   ├── package.json
│   └── tsconfig.json
│
└── data/                           # gitignored at runtime
    ├── db/
    │   └── app.sqlite
    └── assets/
        ├── uploads/                 # unused until Phase 3 (image-to-video), present from Phase 1
        └── generated/
```

## Notes

- `data/` is created at runtime, not committed; `.gitignore` covers it plus `.env`.
- `backend/src/bootstrap/composition-root.ts` is the **only** place that imports both a domain port and its concrete infrastructure implementation together.
- Provider folders under `infrastructure/providers/` are the only place a provider name should appear as an import path — `frontend/` must never contain one.
- `presets/` and `avatarProfiles/` stub folders exist to reserve the layer-consistent naming pattern, not to pre-build unused code — see `PROJECTRULES.md` §2.
