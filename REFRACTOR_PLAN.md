# Refactor Plan (Phased)

## Goal
Reduce complexity and risk in frontend and backend while preserving current behavior.

## Phase 1 (completed in this change set)
- Extract reusable mapper utilities from `frontend/src/lib/logbookPayloadMappers.ts`.
- Start API domain modularization by moving:
  - auth APIs -> `frontend/src/lib/api/modules/auth.ts`
  - reports APIs -> `frontend/src/lib/api/modules/reports.ts`
- Keep `frontend/src/lib/api.ts` as compatibility barrel so existing imports do not break.
- Add focused API contract-style tests for:
  - auth refresh
  - create -> approve -> report endpoint flow

## Phase 2 (next)
- Continue splitting `frontend/src/lib/api.ts` into domain modules:
  - `equipment`, `filters`, `boiler`, `chiller`, `chemical`, `dashboard`.
- Add a shared `unwrapList` utility module and replace repeated list unwrapping code.
- Add tests for each extracted module before removing old in-file declarations.

## Phase 3 (frontend page decomposition)
- Break up large pages into feature folders:
  - `pages/FilterLogBookPage.tsx`
  - `pages/BoilerLogBookPage.tsx`
  - `pages/ChemicalLogBookPage.tsx`
- For each page:
  - extract local hooks (`use*FormState`, `use*Submit`, `use*Validation`)
  - extract rendering sections into components (`Header`, `Table`, `Dialogs`, `ApprovalPanel`)
  - keep top-level page as orchestration only.

## Phase 4 (backend service/query extraction)
- Extract reporting calculations from `backend/reports/dashboard_views.py` into service/query modules.
- Refactor `backend/chiller_logs/views.py` and `backend/boiler_logs/views.py` into:
  - serializer validation in views
  - business logic in services
  - read-heavy aggregation in query modules.
- Replace broad exception fallbacks with explicit, logged domain errors.

## Phase 5 (test depth)
- Frontend:
  - API module tests for each domain.
  - page-level tests on critical approval and correction flows.
- Backend:
  - contract tests for create -> approve -> report linkage.
  - tests for dashboard aggregation error paths.

