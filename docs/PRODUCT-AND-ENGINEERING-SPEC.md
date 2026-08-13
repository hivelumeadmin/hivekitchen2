# Homemade School-Lunch Agent: Product and Engineering Specification

Version: 1.0  
Stack: TypeScript, Node.js, React, Supabase, OpenAI Responses API  
Primary goal: Build and test a school-lunch-first agentic backend before integrating the production React application.

## Product mission

Help families send children to school with nourishing, mostly homemade lunches that children will realistically eat and that fit the family's time, culture, budget, and school constraints. Encourage small moments of family participation—choosing, preparing, packing, or leaving a note—because food preparation can strengthen connection and family routines.

The product must not imply that a homemade lunch makes someone a better parent. Some days require leftovers, carefully selected packaged components, or a simple assembled lunch. The agent should reduce stress and support connection, not create guilt or demand perfection.

### Product priorities, in order

1. Allergen, cross-contact, storage, temperature, and school-policy safety.
2. A lunch the child is likely and able to eat during the available lunch period.
3. Mostly homemade or home-assembled food using recognizable ingredients.
4. Realistic preparation, packing, budget, equipment, and cleanup requirements.
5. Balanced variety across the week without labeling foods as morally “good” or “bad.”
6. Family connection through age-appropriate participation and culturally meaningful foods.
7. Efficient ingredient reuse and low food waste.
8. A sustainable weekly rhythm that deliberately repeats batch-friendly main items when configured.

### Definition of “mostly homemade”

For this product, “mostly homemade” means that the central lunch item or a meaningful portion of the meal is prepared or assembled at home. Useful staples such as bread, tortillas, yogurt, cheese, crackers, sauces, or canned ingredients may be store-bought. The agent must not invent health claims or reject a practical lunch merely because it includes packaged components.

## 1. Product outcome

Build one user-facing School Lunch Planner assistant backed by specialized, testable capabilities:

1. Kitchen Map interviewer: collects household and child preferences, allergens, dietary rules, cooking constraints, and school-lunch logistics.
2. Kitchen Map manager: proposes changes and saves only explicitly confirmed changes.
3. School-lunch planner: creates a five-school-day lunch plan using confirmed Kitchen Map data. Broader meal planning is optional and secondary.
4. Recipe and lunch-preparation assistant: answers ingredient questions and provides preparation, make-ahead, packing, storage, and serving steps.
5. Feedback learner: records explicit and implicit feedback and improves lunch ranking over time, including what was eaten, returned, became soggy, leaked, was difficult to open, or took too long to eat.
6. Family connection helper: suggests optional, age-appropriate ways for children and caregivers to participate in choosing, preparing, or packing lunch.
7. Break-snack planner: recommends separate, usually store-bought snacks for short school breaks using verified household and product information.

The user sees one School Lunch Planner assistant. The backend exposes these capabilities as typed tools. Do not start with independent agents handing work to one another. Introduce explicit agent handoffs only if evaluations later demonstrate a need.

## 2. Non-negotiable safety rules

- Allergies are hard constraints, never preferences.
- The model may propose allergy changes but may not save them without explicit adult confirmation.
- A deterministic TypeScript validator must check every ingredient, substitution, garnish, sauce, and packing component before a plan is shown.
- If allergen data is missing or ambiguous, do not guess. Ask an adult to clarify.
- Do not claim a recipe is medically safe. State that ingredient labels and cross-contact warnings must be checked.
- Do not provide medical diagnosis or treatment.
- Do not make unsupported nutritional claims. Nutrition calculations must come from a verified data source if that feature is introduced.
- Do not shame caregivers or children for packaged food, unfinished food, preferences, body size, appetite, or time limitations.
- Do not pressure a child to eat or use family bonding language to override the child's appetite, sensory needs, or autonomy.
- Never infer that a branded packaged snack is allergen-safe. Product formulations may change; require a current package-label check and use verified catalog data where available.
- Keep children’s data minimal. Use household-member IDs and age groups where possible rather than full names or birth dates.
- The browser must never receive the OpenAI API key or Supabase service-role key.

## 3. Technical architecture

```text
React test UI
    -> TypeScript API route
        -> Meal Planner orchestrator (OpenAI Responses API)
            -> typed application tools
                -> in-memory repository during prototype
                -> Supabase repository after prototype tests pass
            -> deterministic constraint/allergen validator
            -> event and feedback logger
```

OpenAI handles language understanding, questions, explanations, planning proposals, and tool selection. Application code owns authorization, persistence, validation, confirmations, recipe identity, and final safety checks.

## 4. Recommended repository layout

```text
recipe-agent/
  AGENTS.md
  README.md
  package.json
  tsconfig.json
  .env.example
  src/
    config.ts
    server.ts
    schemas/
      kitchen-map.ts
      recipe.ts
      weekly-plan.ts
      feedback.ts
      tool-results.ts
    prompts/
      orchestrator.ts
      kitchen-map.ts
      weekly-planner.ts
      recipe-assistant.ts
      feedback-interpreter.ts
    agents/
      meal-planner.ts
    tools/
      definitions.ts
      dispatcher.ts
      kitchen-map-tools.ts
      planning-tools.ts
      recipe-tools.ts
      feedback-tools.ts
    domain/
      allergen-validator.ts
      constraint-validator.ts
      ranking.ts
      shopping-list.ts
    repositories/
      types.ts
      memory-repository.ts
      supabase-repository.ts
    routes/
      chat.ts
    fixtures/
      households.ts
      recipes.ts
    evals/
      cases.ts
      graders.ts
      run-evals.ts
  tests/
    allergen-validator.test.ts
    kitchen-map.test.ts
    weekly-plan.test.ts
    tool-dispatch.test.ts
    regression.test.ts
  supabase/
    migrations/
```

## 5. Core schemas

Use Zod as the source of truth. Infer TypeScript types from the schemas and use compatible JSON Schemas for OpenAI tools and structured outputs.

### Kitchen Map

```ts
import { z } from "zod";

export const AllergenRuleSchema = z.object({
  allergen: z.string().min(1),
  severity: z.enum(["intolerance", "allergy"]),
  crossContactConcern: z.boolean(),
  confirmedByAdult: z.boolean(),
});

export const HouseholdMemberSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1),
  ageGroup: z.enum(["child", "teen", "adult"]),
  allergens: z.array(AllergenRuleSchema),
  diets: z.array(z.string()),
  likedCuisines: z.array(z.string()),
  likedIngredients: z.array(z.string()),
  dislikedIngredients: z.array(z.string()),
  texturePreferences: z.array(z.string()),
  spiceLevel: z.enum(["none", "mild", "medium", "hot"]),
  schoolLunch: z.object({
    preparationPreference: z.enum(["night_before", "morning", "either"]),
    morningPrepLimitMinutes: z.number().int().min(0),
    childCanAssembleAtSchool: z.boolean(),
    childCanOpenThermos: z.boolean(),
    childCanOpenContainers: z.boolean(),
    microwaveAvailable: z.boolean(),
    refrigeratorAvailable: z.boolean(),
    thermosAllowed: z.boolean(),
    icePackAvailable: z.boolean(),
    utensilsAllowed: z.boolean(),
    nutFreeFacility: z.boolean(),
    maximumEatingMinutes: z.number().int().positive(),
    schoolDays: z.array(z.enum(["monday", "tuesday", "wednesday", "thursday", "friday"])),
    lunchPeriodStart: z.string().optional(),
    classroomOrSchoolFoodRules: z.array(z.string()),
    portionPreference: z.enum(["small", "medium", "large"]),
    appetitePattern: z.enum(["light", "variable", "steady"]),
    preferredFoodFormats: z.array(
      z.enum(["whole", "bite_sized", "wrap", "sandwich", "bento", "thermos"]),
    ),
    foodsToKeepSeparate: z.array(z.string()),
    containersAvailable: z.array(z.string()),
    breakSnacks: z.object({
      enabled: z.boolean(),
      breaks: z.array(z.object({
        period: z.enum(["morning", "afternoon"]),
        durationMinutes: z.number().int().positive(),
      })),
      mustBeIndividuallyPackaged: z.boolean(),
      shelfStableRequired: z.boolean(),
      utensilsAllowed: z.boolean(),
      preferredTypes: z.array(z.enum(["fruit", "sweet", "savory", "mixed"])),
      trustedProductIds: z.array(z.string()),
      weeklyBudget: z.number().nonnegative().optional(),
    }),
  }),
});

export const KitchenMapSchema = z.object({
  householdId: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.enum(["draft", "confirmed"]),
  timezone: z.string(),
  weeklyBudget: z.number().nonnegative().optional(),
  currency: z.string().length(3),
  weekdayPrepLimitMinutes: z.number().int().positive(),
  cookingSkill: z.enum(["beginner", "intermediate", "advanced"]),
  equipment: z.array(z.string()),
  homemadePreference: z.enum(["mostly_homemade", "mixed", "convenience_first"]),
  batchPrepDay: z.enum(["none", "saturday", "sunday", "other"]),
  childParticipationPreference: z.enum(["none", "choosing", "simple_prep", "packing", "flexible"]),
  lunchRepetition: z.object({
    maxOccurrencesPerMainItem: z.number().int().min(1).max(5).default(2),
    targetUniqueMainItemsPerWeek: z.number().int().min(1).max(5).default(3),
    allowConsecutiveDays: z.boolean().default(false),
    preferBatchPreparation: z.boolean().default(true),
    repeatMode: z.enum(["exact", "small_variation", "either"]).default("small_variation"),
    repeatToleranceByMemberId: z.record(z.string(), z.enum(["low", "medium", "high"])),
  }),
  batchPlanning: z.object({
    batchPrepDay: z.enum(["saturday", "sunday", "weekday_evening", "none"]),
    batchPrepMinutes: z.number().int().nonnegative(),
    freezerAvailable: z.boolean(),
    acceptableStorageDays: z.number().int().nonnegative(),
  }),
  householdDiets: z.array(z.string()),
  preferredCuisines: z.array(z.string()),
  dislikedIngredients: z.array(z.string()),
  members: z.array(HouseholdMemberSchema).min(1),
});
```

### Recipe and lunch preparation

```ts
export const IngredientSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  preparationNote: z.string().optional(),
  optional: z.boolean(),
  allergenTags: z.array(z.string()),
});

export const PreparationStepSchema = z.object({
  order: z.number().int().positive(),
  instruction: z.string().min(1),
  durationMinutes: z.number().nonnegative().optional(),
  adultRequired: z.boolean(),
  foodSafetyNote: z.string().optional(),
});

export const RecipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  servings: z.number().int().positive(),
  ingredients: z.array(IngredientSchema).min(1),
  equipment: z.array(z.string()),
  prepMinutes: z.number().int().nonnegative(),
  cookMinutes: z.number().int().nonnegative(),
  steps: z.array(PreparationStepSchema).min(1),
  makeAhead: z.object({
    canPrepareNightBefore: z.boolean(),
    nightBeforeSteps: z.array(z.string()),
    morningSteps: z.array(z.string()),
    storageInstructions: z.string(),
    maximumStorageHours: z.number().nonnegative().optional(),
  }),
  packing: z.object({
    containerType: z.string(),
    thermosRequired: z.boolean(),
    icePackRequired: z.boolean(),
    assemblyAtSchool: z.boolean(),
    steps: z.array(z.string()),
    servingInstructions: z.array(z.string()),
  }),
  substitutions: z.array(z.object({
    originalIngredient: z.string(),
    replacement: z.string(),
    reason: z.string(),
    allergenTags: z.array(z.string()),
  })),
  crossContactWarnings: z.array(z.string()),
});
```

### Weekly plan

```ts
export const PlannedMealSchema = z.object({
  date: z.string(),
  mealType: z.enum(["breakfast", "school_lunch", "dinner", "snack"]),
  recipeId: z.string(),
  servings: z.number().int().positive(),
  intendedMemberIds: z.array(z.string().uuid()).min(1),
  whyRecommended: z.string(),
  homemadeComponents: z.array(z.string()),
  convenienceComponents: z.array(z.string()),
  estimatedMorningMinutes: z.number().int().nonnegative(),
  childParticipation: z.object({
    optional: z.boolean(),
    task: z.string(),
    estimatedMinutes: z.number().int().nonnegative(),
    adultSupervisionRequired: z.boolean(),
  }).optional(),
});

export const WeeklyPlanSchema = z.object({
  weekOf: z.string(),
  schoolDays: z.array(z.object({
    date: z.string(),
    mainLunch: PlannedMealSchema,
    breakSnacks: z.array(z.object({
      period: z.enum(["morning", "afternoon"]),
      productId: z.string().optional(),
      genericDescription: z.string(),
      quantity: z.number().positive(),
      packaged: z.boolean(),
      requiresCurrentLabelCheck: z.boolean(),
      easyToOpen: z.boolean(),
      requiresUtensil: z.boolean(),
      storage: z.enum(["room_temperature", "ice_pack", "refrigerated"]),
    })),
  })),
  batchPrepPlan: z.array(z.object({
    recipeId: z.string(),
    prepareOn: z.string(),
    portionsToPrepare: z.number().int().positive(),
    refrigerationInstructions: z.string(),
    freezingInstructions: z.string().optional(),
    thawingInstructions: z.string().optional(),
    lastAcceptableServingDate: z.string(),
    packFreshComponents: z.array(z.string()),
  })),
  warnings: z.array(z.string()),
});
```

## 6. Tool contract

Start with these tools:

| Tool | Reads/writes | Purpose |
|---|---|---|
| `get_kitchen_map` | Read | Return current confirmed profile and completeness report. |
| `propose_kitchen_map_update` | No durable write | Produce a typed pending change for user review. |
| `confirm_kitchen_map_update` | Write with confirmation token | Save a new version after explicit confirmation. |
| `search_recipes` | Read | Return eligible recipe candidates after hard filtering. |
| `create_weekly_plan` | Write draft | Rank recipes and save a draft plan. |
| `validate_weekly_plan` | Read | Return machine-readable constraint violations. |
| `replace_meal` | Write draft | Replace one meal, then validate the entire plan again. |
| `get_recipe` | Read | Return authoritative recipe, ingredients, and preparation. |
| `record_meal_feedback` | Write | Save explicit feedback without directly changing hard constraints. |
| `search_verified_snacks` | Read | Return household-trusted or catalog-verified snack candidates. |

Every tool result must return one of:

```ts
type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; retryable: boolean };
```

Do not expose generic SQL tools to the model. Each tool must authorize the household ID from the authenticated session; never trust a household ID supplied only by the model.

## 7. System prompts

### 7.1 Meal Planner orchestrator

```text
You are the School Lunch Planner for a family lunch-planning application.

Your job is to understand the user's intent and use the available tools to help create or update a Kitchen Map, build a five-school-day lunch plan, explain recipes and ingredients, provide preparation and packing instructions, replace lunches, or record feedback.

Mission:
- Help families provide nourishing, mostly homemade or home-assembled school lunches that children will realistically eat.
- Support family connection through optional, age-appropriate choosing, preparation, and packing activities.
- Respect family culture, budget, caregiver time, child appetite, sensory needs, and school rules.
- Never shame a caregiver for using packaged components or a child for not eating a food.

Source-of-truth rules:
- Use tools for all household, member, recipe, plan, and feedback data.
- Do not claim that conversation history is the household profile.
- Never invent tool results, recipe IDs, saved preferences, ingredients, or confirmations.
- Treat confirmed allergens, cross-contact constraints, diets, and school restrictions as hard constraints.
- Treat likes, dislikes, cuisines, textures, budget, time, and variety as ranking preferences.

Approval rules:
- You may read data and propose changes without confirmation.
- Before saving a Kitchen Map change, summarize exactly what will change and ask for explicit confirmation.
- Allergy additions, removals, severity changes, and cross-contact changes always require explicit adult confirmation.
- Do not interpret vague agreement as confirmation for an allergy change.

Planning rules:
- Do not create a plan until the Kitchen Map has enough information to evaluate allergens, diets, intended members, preparation time, and school lunch transport.
- Use only recipes returned by recipe tools.
- Ensure every school lunch includes ingredients, ordered preparation steps, night-before steps, morning steps, packing instructions, storage guidance, and at-school serving instructions.
- Prefer a homemade or home-assembled central item when it fits the Kitchen Map. Store-bought staples and practical convenience components are allowed.
- Include one optional child-participation task when appropriate. It must be brief, age-appropriate, safe, and never required.
- Optimize for food that remains appealing after transport and can be eaten within the child's lunch period.
- Treat the main lunch and short-break snacks as separate plan elements. The homemade preference applies primarily to the main lunch; snacks may be store-bought.
- Follow the household repetition configuration. With the default settings, prefer three main preparations across five days, such as A-B-A-C-B, with no main item appearing more than twice.
- For repeated lunches, provide one batch-preparation plan with portioning, refrigeration or freezing, thawing, last safe serving date, and components that must be packed fresh.
- If validation reports a hard-constraint failure, do not present the meal as acceptable. Replace or repair it and validate again.
- Clearly distinguish a verified database allergen check from general label and cross-contact cautions.

Conversation style:
- Ask at most three closely related onboarding questions at a time.
- Use plain language.
- When presenting a weekly plan, lead with a compact summary and let the user ask for details.
- When information is ambiguous and affects safety, ask a question instead of guessing.
```

### 7.2 Kitchen Map interviewer

Use this prompt as a specialized prompt or as instructions in a Kitchen Map-only test:

```text
You collect the minimum information required to build a safe and useful Kitchen Map.

Collect information in this order:
1. Household members and age groups.
2. Allergies, intolerance, cross-contact concern, and who each rule applies to.
3. Dietary rules.
4. School restrictions and lunch transport/reheating conditions.
5. Preparation schedule, equipment, skill, and time limits.
6. Cuisine, ingredient, texture, spice, and food-format preferences.
7. Break schedule, duration, packaging rules, snack preferences, trusted products, and snack budget.
8. Desired level of homemade preparation, repetition tolerance, batch-prep habits, cleanup tolerance, and child participation.
9. Budget and variety preferences.

Ask no more than three related questions per message. Reflect important answers back for correction. Never classify a dislike as an allergy. If the user says an ingredient 'does not agree with' someone, ask whether it is an allergy, intolerance, or preference. Produce only a proposed Kitchen Map update until the user explicitly confirms it.
```

### 7.3 Weekly planner

```text
You create a varied five-school-day lunch plan from a confirmed Kitchen Map and eligible recipe candidates.

Hard constraints must all pass: allergens, cross-contact requirements represented in the data, diets, school restrictions, available equipment, transport/reheating constraints, and intended household members.

Optimize soft goals: prior acceptance, cuisine affinity, ingredient affinity, mostly homemade preparation, morning feasibility, transport quality, eating-time fit, budget, ingredient reuse, low food waste, variety, and low recent repetition.

Apply repetition intentionally. The default is a maximum of two occurrences per main item and three unique main items across five school days. Prefer a nonconsecutive A-B-A-C-B pattern when recipe storage and texture permit. Small variations may change a side, safe sauce, or presentation but should not add substantial cost or preparation.

Plan break snacks separately. They are usually store-bought, quick to open, low-mess, and suitable for the short break. Recommend a branded product only when a verified product record is returned; always require the adult to check the current package label.

For every lunch, identify homemade components and convenience components. Include an optional family-participation task such as choosing fruit, washing produce, stirring a filling, filling a compartment, or adding a note. Do not suggest knife, heat, or allergen-sensitive tasks unless the child's capability and adult supervision make them appropriate.

Use only candidate recipe IDs supplied by tools. Do not write new recipe details during selection. Return a structured plan, then call the validation tool. Repair every hard failure before presenting the plan. If no valid candidate exists, explain the missing coverage instead of inventing a recipe.
```

### 7.4 Recipe and lunch-preparation assistant

```text
Answer questions using the saved recipe returned by tools.

For a school lunch, include:
- measured ingredients;
- equipment;
- numbered cooking/preparation steps;
- time per step when useful;
- whether adult help is required;
- which components are homemade or assembled at home;
- night-before preparation;
- morning preparation;
- packing steps and container type;
- ice-pack or thermos requirement from verified recipe data;
- storage instructions;
- at-school assembly and serving steps;
- substitutions that have passed validation.
- one optional, safe, age-appropriate child participation step when appropriate.

Do not introduce an ingredient, garnish, sauce, or substitution not present in validated tool data. Do not state that a lunch is allergy-safe in absolute terms. Remind the adult to verify packaged-food labels and school cross-contact policies when relevant.
```

### 7.5 Feedback interpreter

```text
Convert the user's comments about a served meal into structured feedback.

Distinguish:
- child acceptance;
- adult acceptance;
- taste, texture, temperature, portion, packaging, preparation effort, and time;
- whether the meal should be repeated;
- how much returned uneaten and why, if known;
- sogginess, leaking, temperature, container difficulty, and insufficient eating time;
- whether the child enjoyed participating in selection, preparation, or packing;
- a temporary event from a durable preference.

Record observations and confidence. Do not convert one rejection into a permanent dislike. Do not change allergies or diets from feedback. Ask for confirmation before proposing a durable Kitchen Map change.
```

## 8. Build sequence and exit criteria

### Layer 0: Project foundation

Build:

- Node.js TypeScript project.
- `openai`, `zod`, `vitest`, `tsx`, and an HTTP framework such as Fastify.
- Environment validation for `OPENAI_API_KEY`.
- `.env.example`; never commit `.env`.
- Formatting, linting, type checking, and tests.

Exit criteria:

- `npm test` passes.
- `npm run typecheck` passes.
- A health endpoint works without OpenAI.

### Layer 1: Kitchen Map without a database

Build:

- Zod schemas.
- In-memory repository.
- `get_kitchen_map`, `propose_kitchen_map_update`, and `confirm_kitchen_map_update`.
- Confirmation tokens that expire and bind to the household, user, proposed diff, and profile version.
- A CLI chat harness or minimal HTML test page.

Test:

- New household onboarding.
- “My child hates peanuts” is not stored as an allergy.
- “My child is allergic to peanuts” requires adult confirmation.
- Conflicting updates are rejected by optimistic version checking.

Exit criteria:

- Ten scripted conversations produce valid Kitchen Maps.
- No allergy mutation occurs without confirmation.

### Layer 2: Recipe catalog and deterministic validator

Build:

- Twenty curated fixture recipes.
- Normalized ingredient allergen tags.
- Pure TypeScript validation functions.
- Tests for direct ingredients, substitutions, sauces, toppings, school restrictions, equipment, and reheating.

Important: validation must not call OpenAI.

Exit criteria:

- All unsafe fixture plans fail for the expected reason.
- All safe fixture plans pass.
- Validator tests include peanut/tree nut, dairy, egg, wheat, soy, sesame, fish, and shellfish cases.

### Layer 3: Five-day school-lunch planner

Build:

- `search_recipes`, `create_weekly_plan`, `validate_weekly_plan`, and `replace_meal`.
- `search_verified_snacks` and separate break-snack output.
- Structured weekly-plan output.
- A loop capped at two repair attempts. If repair still fails, return a controlled error.
- Shopping-list aggregation as deterministic TypeScript.

Exit criteria:

- At least 30 household scenarios pass hard-constraint checks.
- Plans use only known recipe IDs.
- Every lunch has complete preparation and packing data.
- Every lunch identifies homemade and convenience components without judgmental language.
- Every appropriate lunch offers an optional child-participation step.
- Plans fit the child's lunch duration, transport, storage, container, and opening constraints.
- The default five-day plan uses at most three main preparations and at most two occurrences per main item when valid candidates permit it.
- Repeated lunches include batch quantities, storage, freezing/thawing where relevant, a last serving date, and fresh-pack components.
- Break snacks are clearly separated from the main lunch and never receive an unverified allergen-safe claim.

### Layer 4: Recipe Q&A

Build:

- `get_recipe` tool.
- Questions about ingredients, substitutions, quantities, preparation steps, packing, and leftovers.
- Tests ensuring the response remains grounded in the retrieved recipe.

Exit criteria:

- The model never invents a stored ingredient in the regression set.
- Proposed substitutions are validated before presentation.

### Layer 5: Feedback and personalization

Build:

- `record_meal_feedback`.
- Recommendation events capturing candidates, selected recipe, reasons, edits, and outcome.
- A deterministic initial ranker.

Example initial scoring:

```text
+5 loved previously
+3 liked previously
+2 preferred cuisine
+2 acceptable preparation time
+1 useful ingredient overlap
-2 served in last 14 days
-4 disliked previously
-3 high parent effort
hard reject for any constraint violation
```

Do not fine-tune initially. Improve retrieval and ranking from structured feedback first.

Exit criteria:

- Later plans respond predictably to recorded feedback.
- One negative observation does not become a permanent preference.
- Ranking explanations identify the stored signals used.

### Layer 6: Supabase persistence

Replace the in-memory repository behind the same interface.

Initial tables:

- `households`
- `household_members`
- `allergen_rules`
- `dietary_rules`
- `member_preferences`
- `school_lunch_constraints`
- `kitchen_map_versions`
- `recipes`
- `recipe_ingredients`
- `weekly_plans`
- `weekly_plan_items`
- `meal_feedback`
- `recommendation_events`
- `conversation_sessions`

Requirements:

- Row Level Security on every household-scoped table.
- Authenticated user-to-household membership table.
- Server-side service role only where strictly needed.
- Versioned Kitchen Map snapshots for audit and rollback.
- Database constraints for enums and required foreign keys.

Exit criteria:

- Two test households cannot read or mutate one another’s data.
- Repository contract tests pass against memory and Supabase implementations.

### Layer 7: Evaluation dataset

Create JSONL or TypeScript fixtures covering:

- incomplete onboarding;
- allergies versus dislikes;
- conflicting family preferences;
- nut-free schools;
- cold lunch, thermos, and microwave cases;
- inaccessible containers;
- strict morning time limits;
- hidden allergens in sauces and substitutions;
- repeated main-item patterns, including the default A-B-A-C-B configuration;
- unsafe storage duration for a repeated lunch;
- store-bought break snacks with changing or unknown labels;
- user requests to ignore an allergy;
- plan replacement;
- ingredient and preparation questions;
- feedback accumulation.

Track:

- hard-constraint violation rate: target 0%;
- tool selection accuracy;
- invalid-schema rate;
- unsupported recipe detail rate;
- weekly plan acceptance rate;
- meal replacement rate;
- parent edit rate;
- lunch preparation completeness;
- latency and token usage.

Use OpenAI Datasets/dashboard experimentation where available, but keep a local Vitest regression suite so the project is not dependent on a dashboard feature.

## 9. How to test on the OpenAI platform

1. Create an OpenAI API project and a project-scoped API key.
2. Set a small project budget and usage alerts.
3. In the Playground, start with the orchestrator system prompt and manually supply representative Kitchen Map context for prompt-only behavior tests.
4. Test each specialist prompt separately before testing tool orchestration.
5. Add the exact JSON Schema for each tool; do not simulate successful writes in production.
6. Move repeatable cases into a Dataset or your local test harness.
7. Compare a cost-balanced model with the flagship model on the same cases.
8. Freeze the chosen model snapshot or record the exact model string for reproducible regression tests.
9. Version every system prompt in source control and log the prompt version with every recommendation event.

Recommended initial model routing:

- `gpt-5.6-terra`, low reasoning: primary orchestrator and weekly planning baseline.
- `gpt-5.6-luna`, low or no reasoning: extraction and feedback classification after it passes the same tests.
- `gpt-5.6-sol`: quality benchmark and difficult-case comparison, not necessarily every production request.

Model choice must be confirmed with evaluations on this application rather than assumed from the model tier.

## 10. Minimal Responses API loop

The exact SDK types can change; Codex must verify the installed SDK and current official API reference before finalizing this code.

```ts
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function runMealPlanner(input: {
  userId: string;
  householdId: string;
  message: string;
  previousResponseId?: string;
}) {
  let response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
    reasoning: { effort: "low" },
    instructions: MEAL_PLANNER_SYSTEM_PROMPT,
    input: input.message,
    previous_response_id: input.previousResponseId,
    tools: TOOL_DEFINITIONS,
  });

  for (let turn = 0; turn < 8; turn += 1) {
    const calls = response.output.filter((item) => item.type === "function_call");
    if (calls.length === 0) {
      return { responseId: response.id, text: response.output_text };
    }

    const outputs = await Promise.all(
      calls.map(async (call) => ({
        type: "function_call_output" as const,
        call_id: call.call_id,
        output: JSON.stringify(
          await dispatchAuthorizedTool({
            userId: input.userId,
            householdId: input.householdId,
            name: call.name,
            argumentsJson: call.arguments,
          }),
        ),
      })),
    );

    response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
      previous_response_id: response.id,
      input: outputs,
      tools: TOOL_DEFINITIONS,
    });
  }

  throw new Error("Agent exceeded the maximum tool-turn limit");
}
```

## 11. Codex project instructions (`AGENTS.md`)

Place this in the repository root:

```text
# Recipe Agent engineering instructions

- Use TypeScript only; do not add Python.
- Use strict TypeScript and Zod at all external boundaries.
- Use the OpenAI Responses API for new model interactions.
- Keep OpenAI and Supabase privileged keys server-side.
- Treat Supabase and repository tools as the source of truth; never rely on model memory for household facts.
- Allergens, diets, and school restrictions are hard constraints.
- Never implement allergen checking solely in prompts. Use pure deterministic TypeScript validation with unit tests.
- The model may propose Kitchen Map mutations; durable writes require explicit confirmation.
- Do not expose generic database or SQL tools to the model.
- Every school lunch must include ingredients, equipment, numbered preparation steps, night-before steps, morning steps, packing, storage, and serving instructions.
- Add or update tests with every behavior change.
- Run lint, typecheck, and tests before declaring work complete.
- Preserve unrelated user changes.
- Before using an OpenAI API or SDK field, verify it against the installed SDK and current official OpenAI documentation.
```

## 12. Copy-paste master prompt for Codex

Open a new empty repository in Codex, save this blueprint as `docs/recipe-agent-build-blueprint.md`, add the `AGENTS.md` above, and send this prompt:

```text
Build Layer 0 and Layer 1 from docs/recipe-agent-build-blueprint.md.

Use TypeScript only. Do not implement the React application or Supabase yet. Create a small, testable Node.js service with an in-memory repository and a CLI or minimal local HTTP chat harness.

Before coding:
1. Read AGENTS.md and the blueprint completely.
2. Inspect the workspace and preserve existing files.
3. Check the current official OpenAI TypeScript documentation for the Responses API, function calling, structured outputs, and conversation state.
4. Produce a short implementation plan and then execute it.

Required outcomes:
- Strict TypeScript configuration.
- Zod schemas for the Kitchen Map and tool inputs/results.
- Versioned in-memory Kitchen Map repository.
- Tools named get_kitchen_map, propose_kitchen_map_update, and confirm_kitchen_map_update.
- Confirmation tokens bound to user, household, profile version, expiry, and exact proposed diff.
- OpenAI Responses API tool loop with a maximum-turn limit and structured error handling.
- The Meal Planner and Kitchen Map prompts from the blueprint stored as versioned source files.
- Tests proving that allergy changes cannot be saved without explicit confirmation, dislikes are not silently converted to allergies, invalid tool arguments are rejected, and household boundaries are enforced.
- `.env.example`, README setup instructions, lint, typecheck, and test scripts.

Do not add a generic SQL tool, autonomous multi-agent handoffs, embeddings, fine-tuning, web search, or production deployment in this layer.

Use a repository interface so Supabase can replace the in-memory implementation later. Mock the OpenAI boundary in unit tests; provide one opt-in integration test that runs only when OPENAI_API_KEY is present.

Run all checks and report:
- files created or changed;
- commands run and their results;
- any current API details that required an assumption;
- exact local instructions for testing one onboarding conversation.

Stop after Layer 1 is complete. Do not begin Layer 2.
```

## 13. Prompts for subsequent Codex sessions

After accepting each layer, use a fresh prompt so scope remains controlled.

### Layer 2 prompt

```text
Implement only Layer 2 from docs/recipe-agent-build-blueprint.md. Add a curated recipe fixture catalog and a pure deterministic TypeScript constraint/allergen validator. Do not call OpenAI from validation. Cover direct ingredients, sauces, toppings, substitutions, school restrictions, equipment, storage, and reheating. Run all existing and new tests. Stop after Layer 2.
```

### Layer 3 prompt

```text
Implement only Layer 3 from docs/recipe-agent-build-blueprint.md. Add typed recipe search, weekly planning, plan validation, meal replacement, structured outputs, and deterministic shopping-list aggregation. Use only catalog recipe IDs. Require complete preparation and packing data for every school lunch. Cap automatic repair at two attempts. Run all checks and stop after Layer 3.
```

### Layer 4 prompt

```text
Implement only Layer 4 from docs/recipe-agent-build-blueprint.md. Add grounded recipe and lunch-preparation Q&A using the authoritative get_recipe tool. Validate every substitution before presenting it. Add regression tests against invented ingredients and unsupported safety claims. Run all checks and stop after Layer 4.
```

### Layer 5 prompt

```text
Implement only Layer 5 from docs/recipe-agent-build-blueprint.md. Add structured feedback, recommendation-event logging, and the initial deterministic ranker. Do not fine-tune. Prove through tests that repeated feedback changes ranking predictably while a single negative observation does not create a permanent dislike. Run all checks and stop after Layer 5.
```

### Layer 6 prompt

```text
Implement only Layer 6 from docs/recipe-agent-build-blueprint.md. Add Supabase migrations, RLS policies, and a repository implementation that passes the same contract suite as the memory repository. Keep all privileged credentials server-side. Test cross-household isolation. Run all checks and stop after Layer 6.
```

### Layer 7 prompt

```text
Implement only Layer 7 from docs/recipe-agent-build-blueprint.md. Create a representative local evaluation set, deterministic graders, model-output graders only where judgment is necessary, prompt/model version logging, and an evaluation report covering safety, grounding, tool choice, preparation completeness, latency, and tokens. Do not optimize prompts until a baseline is recorded. Run all checks and stop after producing the baseline report.
```

## 14. Definition of MVP success

The backend is ready for React integration when:

- a household can complete and confirm a Kitchen Map;
- allergy changes require explicit adult confirmation;
- the assistant can produce and validate a one-week plan;
- every school lunch includes complete preparation and packing steps;
- recipe questions are grounded in stored recipe data;
- replacements are revalidated;
- feedback affects future ranking predictably;
- household data isolation tests pass;
- the regression set has zero hard-constraint violations;
- prompt and model versions are logged for every recommendation.

## 15. Current official references

- Responses API migration: https://developers.openai.com/api/docs/guides/migrate-to-responses
- Function calling: https://developers.openai.com/api/docs/guides/function-calling
- Structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- Conversation state: https://developers.openai.com/api/docs/guides/conversation-state
- Agents SDK: https://developers.openai.com/api/docs/guides/agents
- Model guidance: https://developers.openai.com/api/docs/guides/latest-model
- Evaluations: https://developers.openai.com/api/docs/guides/evals
- Safety best practices: https://developers.openai.com/api/docs/guides/safety-best-practices

Recheck these references when implementation begins because SDK and platform behavior can change.
