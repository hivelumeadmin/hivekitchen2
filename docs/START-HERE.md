# Start Here: Homemade School-Lunch Agent

This packet is the development handoff for Codex.

## Files

- `PRODUCT-AND-ENGINEERING-SPEC.md`: product behavior, architecture, schemas, prompts, tools, test layers, and safety requirements.
- `AGENTS.md`: durable engineering rules. Copy this to the repository root.
- `CODEX-PROMPTS.md`: one prompt per implementation layer. Run them in order and do not combine layers.
- `ACCEPTANCE-CHECKLIST.md`: human review gates before moving to the next layer.

## Recommended workflow

1. Create a new Git repository.
2. Copy all packet files into `docs/`, except copy `AGENTS.md` to the repository root.
3. Open the repository with Codex.
4. Send the Layer 0/1 prompt from `CODEX-PROMPTS.md`.
5. Review the changes and complete the matching acceptance checklist.
6. Commit the accepted layer.
7. Continue with exactly one layer per Codex task.

The initial backend uses an in-memory repository. Add Supabase only after Kitchen Map, deterministic validation, planning, recipe Q&A, and feedback behavior pass locally.

## Product summary

The application plans five school days. Each day has:

- one mostly homemade or home-assembled main lunch;
- zero or more separate, usually store-bought break snacks;
- preparation, storage, packing, and serving instructions;
- an optional family-participation task.

The default repetition strategy is three unique main preparations across five days, typically A-B-A-C-B. A main item appears no more than twice unless the household changes its configuration.
