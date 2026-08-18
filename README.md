# Homemade School-Lunch Agent — Layers 0–3

A strict TypeScript/Node.js prototype for collecting and confirming a household Kitchen Map. It includes an in-memory, versioned repository; household authorization; Zod-validated tool boundaries; signed expiring confirmations; a Fastify health/chat harness; and an OpenAI Responses API tool loop.

Layer 2 adds 20 curated main-lunch fixtures, eight catalog-verified snack fixtures, and pure deterministic TypeScript validation for allergens, cross-contact, diets, school rules, equipment, storage, freezing/thawing, reheating, packing, containers, eating time, and short-break package constraints. It does not include weekly plan generation, Supabase, or production deployment.

Validation never calls OpenAI. Branded snack records are schema-invalid unless they require a current package-label check, and successful branded-snack validation still returns that adult-check caution.

Layer 3 adds authorized recipe and verified-snack search, deterministic five-school-day planning, whole-plan validation, meal replacement with at most two automatic repairs, batch-prep details for every repeated main, and deterministic shopping-list aggregation. The default cadence is A-B-A-C-B with three unique mains and no item occurring more than twice. Main lunches and break snacks remain separate plan elements. Supabase and production deployment remain out of scope.

Run Layer 3's focused regression suite with:

```powershell
npm.cmd test -- tests/weekly-plan.test.ts tests/planning-tools.test.ts
```

## Requirements

- Node.js 20 or newer
- An OpenAI API key only for the chat harness or opt-in integration test

## Setup and checks

```powershell
npm.cmd install --cache .npm-cache
Copy-Item .env.example .env
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
```

The application does not automatically load `.env`; set variables in the server process environment. Do not expose `OPENAI_API_KEY` or `CONFIRMATION_SECRET` to browser code.

## Health endpoint

No OpenAI key is required:

```powershell
$env:CONFIRMATION_SECRET = "replace-with-at-least-32-characters"
npm.cmd start
Invoke-RestMethod http://127.0.0.1:3000/health
```

Expected result: `{ ok: true, service: "school-lunch-agent" }`.

## Test one onboarding conversation locally

1. Set server-side configuration:

   ```powershell
   $env:OPENAI_API_KEY = "your-project-key"
   $env:OPENAI_MODEL = "gpt-5.6-terra"
   $env:CONFIRMATION_SECRET = "replace-with-at-least-32-characters"
   ```

2. Generate two UUIDs and start the in-memory CLI:

   ```powershell
   $userId = [guid]::NewGuid().ToString()
   $householdId = [guid]::NewGuid().ToString()
   npm.cmd run chat -- $userId $householdId
   ```

3. Try: `Help me set up school lunches for one child.` Answer the interview. When shown the exact proposed update, explicitly confirm it. If the proposal changes an allergy, say that you are an adult and explicitly confirm the allergy change; ordinary confirmation is deliberately rejected.

The CLI repository is process-local and is discarded on exit. Continue the same model conversation by keeping the CLI open; the harness carries the latest Responses API `previous_response_id`.

## API behavior

- `GET /health` works without OpenAI.
- `POST /chat` requires `OPENAI_API_KEY`. Its JSON body contains `userId`, `householdId`, `message`, and optionally `previousResponseId`.
- The three model tools are `get_kitchen_map`, `propose_kitchen_map_update`, and `confirm_kitchen_map_update`.
- The authenticated context supplies household identity; model arguments do not choose the household.
- Confirmation tokens use HMAC-SHA-256 and bind user, household, base profile version, expiry, exact canonical diff, and the validated proposed profile. Optimistic version checks prevent replay over a newer profile.

## OpenAI integration test

`npm.cmd test` skips the live test by default. Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) to opt in. Unit tests mock the Responses API boundary.
