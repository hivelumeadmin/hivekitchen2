# Acceptance checklist

## Layer 0/1

- [ ] TypeScript is strict and no Python was added.
- [ ] Kitchen Map distinguishes allergies, intolerance, and dislikes.
- [ ] Main lunch and break snacks have separate constraints.
- [ ] Repetition defaults are maximum 2 occurrences and 3 unique main preparations.
- [ ] Allergy mutations require explicit adult confirmation.
- [ ] Household isolation, expiry, and stale-version tests pass.

## Layer 2

- [ ] All validation is deterministic TypeScript.
- [ ] Ingredients, sauces, garnishes, and substitutions are checked.
- [ ] Storage duration and repeated-lunch freshness are checked.
- [ ] Branded snacks require verified data and current-label checking.
- [ ] Unsafe fixtures fail for the expected reason.

## Layer 3

- [ ] Every school day has one main lunch and separate break snacks.
- [ ] Default plan normally follows A-B-A-C-B.
- [ ] No main item appears more than twice by default.
- [ ] Household repetition overrides work.
- [ ] Batch plan includes quantities, storage, thawing, last serving date, and fresh components.
- [ ] Each main lunch has complete preparation and packing instructions.
- [ ] Snacks fit break duration, packaging, storage, utensils, and opening constraints.

## Layer 4

- [ ] Answers are grounded in retrieved recipe or product records.
- [ ] Substitutions are validated before presentation.
- [ ] The system does not invent branded product allergen claims.

## Layer 5

- [ ] Main-lunch and snack feedback are distinguishable.
- [ ] Returned food, texture, transport, and opening problems are captured.
- [ ] One negative event does not become a permanent dislike.
- [ ] Repetition tolerance influences later plans predictably.

## Layer 6

- [ ] RLS applies to every household-scoped table.
- [ ] Cross-household access tests fail closed.
- [ ] Memory and Supabase repository contract suites both pass.

## Layer 7

- [ ] Baseline results are saved before prompt optimization.
- [ ] Hard-constraint violation rate is zero in the release set.
- [ ] Main/snack separation and repetition configuration have regression coverage.
- [ ] Prompt and model versions are logged.
