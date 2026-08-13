# Staged prompts for Codex

Run one prompt at a time. Commit an accepted layer before starting the next.

## Layer 0 and Layer 1: foundation and Kitchen Map

```text
Build only Layer 0 and Layer 1 from docs/PRODUCT-AND-ENGINEERING-SPEC.md.

Read AGENTS.md and the specification completely before coding. Use TypeScript only. Build a strict Node.js service with Zod, an in-memory repository, and a CLI or minimal HTTP harness. Verify current official OpenAI TypeScript documentation for Responses API function calling and conversation state.

Implement the full school-lunch Kitchen Map, including separate main-lunch and break-snack constraints, mostly-homemade preference, child participation, repetition defaults, batch-prep configuration, school schedules, containers, and short-break rules.

Implement get_kitchen_map, propose_kitchen_map_update, and confirm_kitchen_map_update. Confirmation tokens must bind to user, household, profile version, expiry, and exact diff. Allergy changes require explicit adult confirmation.

Add tests for household isolation, dislikes versus allergies, invalid arguments, confirmation expiry, stale versions, repetition defaults of max 2 and target 3 unique mains, and separate snack configuration.

Mock OpenAI in unit tests and provide one opt-in integration test when OPENAI_API_KEY exists. Run lint, typecheck, and tests. Report files changed, commands and results, API assumptions, and exact local test steps. Stop after Layer 1.
```

## Layer 2: catalog and deterministic validation

```text
Implement only Layer 2 from docs/PRODUCT-AND-ENGINEERING-SPEC.md. Add curated main-lunch recipes, verified snack fixtures, and pure deterministic TypeScript validators. Validate ingredients, sauces, toppings, substitutions, school rules, storage duration, refrigeration, freezing/thawing, reheating, containers, eating time, and package-opening constraints. Never call OpenAI from validation. A branded snack must require a current-label check. Run all checks and stop after Layer 2.
```

## Layer 3: five-day school food planner

```text
Implement only Layer 3 from docs/PRODUCT-AND-ENGINEERING-SPEC.md. Generate five school days, each with one main lunch and zero or more separate break snacks. Implement recipe search, verified snack search, structured planning, validation, meal replacement, shopping-list aggregation, and a batch-prep plan.

Default to three unique main preparations and a maximum of two occurrences per main item, preferring A-B-A-C-B without consecutive repeats. Respect household overrides, child repetition tolerance, freshness, storage, and texture. Every repeated main must include portions, preparation date, refrigeration/freezing, thawing, last acceptable serving date, and components packed fresh. Snacks are normally store-bought and must be quick, low-mess, easy to open, and separately represented.

Cap automatic repair at two attempts. Use only catalog IDs. Run all checks and stop after Layer 3.
```

## Layer 4: grounded lunch and snack Q&A

```text
Implement only Layer 4. Add grounded questions about main-lunch ingredients, quantities, preparation, packing, storage, repetition, batch prep, and separate break snacks. Retrieve authoritative records through tools. Validate substitutions. Never invent a recipe ingredient, product fact, storage claim, or allergen-safe branded snack. Run all checks and stop after Layer 4.
```

## Layer 5: feedback and personalization

```text
Implement only Layer 5. Record what was eaten or returned, taste, texture, sogginess, leaking, temperature, portion, opening difficulty, insufficient break time, preparation effort, snack acceptance, repeat tolerance, and optional participation enjoyment. Add recommendation-event logging and a deterministic ranker. Do not fine-tune. Prove repeated feedback changes ranking predictably while one rejection does not become a permanent dislike. Run all checks and stop after Layer 5.
```

## Layer 6: Supabase

```text
Implement only Layer 6. Add Supabase migrations, RLS, authenticated household membership, versioned Kitchen Maps, recipes, products, plan days, main lunches, break snacks, batch-prep instructions, feedback, and recommendation events. Implement the same repository contract as memory storage. Keep privileged keys server-side and test cross-household isolation. Run all checks and stop after Layer 6.
```

## Layer 7: evaluation

```text
Implement only Layer 7. Build local evaluation fixtures and graders for safety, grounding, correct separation of main lunch and break snacks, default A-B-A-C-B repetition, household overrides, storage freshness, label-check language, preparation completeness, tool choice, latency, and tokens. Record a baseline before optimizing. Run all checks and stop after producing the report.
```
