import { RecipeSchema, type AllergenTag, type Recipe } from "../schemas/recipe.js";

type RecipeSeed = {
  id: string;
  title: string;
  main: string;
  allergens?: AllergenTag[];
  sauce?: { name: string; allergens: AllergenTag[] };
  topping?: { name: string; allergens: AllergenTag[] };
  diets?: string[];
  hot?: boolean;
  reheatMode?: "none" | "microwave" | "thermos";
  eatingMinutes?: number;
  equipment?: string[];
  containers?: string[];
  utensils?: boolean;
  canFreeze?: boolean;
  refrigeratedHours?: number;
  crossContact?: AllergenTag[];
  prohibitedSchoolRules?: string[];
};

function recipe(seed: RecipeSeed): Recipe {
  const hot = seed.hot ?? false;
  const reheatMode = seed.reheatMode ?? (hot ? "thermos" : "none");
  const canFreeze = seed.canFreeze ?? false;
  return RecipeSchema.parse({
    id: seed.id,
    title: seed.title,
    servings: 4,
    ingredients: [
      {
        id: `${seed.id}-main`,
        name: seed.main,
        quantity: 4,
        unit: "servings",
        optional: false,
        role: "main",
        allergenTags: seed.allergens ?? [],
      },
      ...(seed.sauce
        ? [
            {
              id: `${seed.id}-sauce`,
              name: seed.sauce.name,
              quantity: 0.5,
              unit: "cup",
              optional: false,
              role: "sauce" as const,
              allergenTags: seed.sauce.allergens,
            },
          ]
        : []),
      ...(seed.topping
        ? [
            {
              id: `${seed.id}-topping`,
              name: seed.topping.name,
              quantity: 0.25,
              unit: "cup",
              optional: true,
              role: "topping" as const,
              allergenTags: seed.topping.allergens,
            },
          ]
        : []),
    ],
    equipment: seed.equipment ?? ["mixing bowl"],
    prepMinutes: 15,
    cookMinutes: hot ? 20 : 0,
    eatingMinutes: seed.eatingMinutes ?? 15,
    supportedDiets: seed.diets ?? [],
    steps: [
      {
        order: 1,
        instruction: `Prepare ${seed.main} with clean equipment and measured ingredients.`,
        durationMinutes: 10,
        adultRequired: hot,
        ...(hot ? { foodSafetyNote: "Cook fully, cool promptly, and store covered." } : {}),
      },
      {
        order: 2,
        instruction: "Portion the lunch into the specified container.",
        durationMinutes: 5,
        adultRequired: false,
      },
    ],
    makeAhead: {
      canPrepareNightBefore: true,
      nightBeforeSteps: ["Prepare and refrigerate covered in shallow containers."],
      morningSteps: ["Pack the portion and add freshly packed components."],
      storageInstructions: "Refrigerate promptly at 40°F/4°C or colder until packing.",
      maximumRefrigeratedHours: seed.refrigeratedHours ?? 48,
      maximumQualityHours: Math.min(seed.refrigeratedHours ?? 48, 48),
      canFreeze,
      freezingPreservesTexture: canFreeze,
      maximumFrozenDays: canFreeze ? 30 : 0,
      ...(canFreeze
        ? {
            freezingInstructions: "Freeze individual portions after cooling.",
            thawingInstructions: "Thaw overnight in the refrigerator; never on the counter.",
          }
        : {}),
    },
    packing: {
      allowedContainerTypes:
        seed.containers ?? (reheatMode === "thermos" ? ["thermos"] : ["bento box", "lunch box"]),
      thermosRequired: reheatMode === "thermos",
      icePackRequired: reheatMode !== "thermos",
      refrigerationRequired: reheatMode !== "thermos",
      assemblyAtSchool: false,
      utensilsRequired: seed.utensils ?? hot,
      minimumOpeningCapability: reheatMode === "thermos" ? "thermos" : "standard",
      steps:
        reheatMode === "thermos"
          ? ["Preheat the thermos, add piping-hot food, and seal immediately."]
          : ["Pack cold with a frozen ice pack."],
      servingInstructions: ["Open only at lunch and eat within the available lunch period."],
    },
    reheating: {
      mode: reheatMode,
      instructions:
        reheatMode === "thermos"
          ? ["Reheat until steaming before transferring to a preheated thermos."]
          : reheatMode === "microwave"
            ? ["Keep chilled and microwave at school until steaming, with adult-approved handling."]
            : [],
    },
    substitutions: [
      {
        id: `${seed.id}-soy-substitution`,
        originalIngredientId: `${seed.id}-main`,
        replacement: "tofu filling",
        reason: "Optional plant-based variation",
        allergenTags: ["soy"],
      },
    ],
    crossContactAllergenTags: seed.crossContact ?? [],
    prohibitedSchoolRules: seed.prohibitedSchoolRules ?? [],
  });
}

const seeds: RecipeSeed[] = [
  {
    id: "bean-rice-bento",
    title: "Bean and Rice Bento",
    main: "black beans and brown rice",
    diets: ["vegetarian", "vegan"],
    canFreeze: true,
  },
  {
    id: "chicken-pita",
    title: "Chicken Pita Pockets",
    main: "chicken and wheat pita",
    allergens: ["wheat"],
    sauce: { name: "yogurt sauce", allergens: ["dairy"] },
  },
  {
    id: "sesame-noodles",
    title: "Sesame Vegetable Noodles",
    main: "wheat noodles",
    allergens: ["wheat"],
    sauce: { name: "sesame soy sauce", allergens: ["sesame", "soy"] },
    diets: ["vegetarian"],
  },
  {
    id: "egg-salad-wrap",
    title: "Egg Salad Wrap",
    main: "egg salad in wheat wrap",
    allergens: ["egg", "wheat"],
    eatingMinutes: 12,
  },
  {
    id: "salmon-rice",
    title: "Salmon Rice Box",
    main: "baked salmon and rice",
    allergens: ["fish"],
    utensils: true,
  },
  {
    id: "shrimp-quinoa",
    title: "Shrimp Quinoa Cup",
    main: "shrimp and quinoa",
    allergens: ["shellfish"],
    utensils: true,
  },
  {
    id: "cheese-quesadilla",
    title: "Bean and Cheese Quesadilla",
    main: "wheat tortilla and cheese",
    allergens: ["wheat", "dairy"],
    canFreeze: true,
  },
  {
    id: "peanut-soba",
    title: "Peanut Soba Bowl",
    main: "soba noodles",
    allergens: ["wheat"],
    sauce: { name: "peanut sauce", allergens: ["peanut", "soy"] },
    prohibitedSchoolRules: ["nut_free_facility"],
  },
  {
    id: "almond-chicken",
    title: "Almond Chicken Salad",
    main: "chicken salad",
    topping: { name: "sliced almonds", allergens: ["tree_nut"] },
    prohibitedSchoolRules: ["nut_free_facility"],
  },
  {
    id: "hummus-bento",
    title: "Hummus Vegetable Bento",
    main: "vegetables and pita",
    allergens: ["wheat"],
    sauce: { name: "hummus", allergens: ["sesame"] },
    diets: ["vegetarian", "vegan"],
  },
  {
    id: "turkey-pinwheels",
    title: "Turkey Pinwheels",
    main: "turkey and wheat tortilla",
    allergens: ["wheat", "dairy"],
  },
  {
    id: "lentil-soup",
    title: "Lentil Vegetable Soup",
    main: "lentil soup",
    diets: ["vegetarian", "vegan"],
    hot: true,
    utensils: true,
    canFreeze: true,
  },
  {
    id: "chicken-noodle-soup",
    title: "Chicken Noodle Soup",
    main: "chicken and egg noodles",
    allergens: ["wheat", "egg"],
    hot: true,
    reheatMode: "microwave",
    containers: ["bento box"],
    utensils: true,
    canFreeze: true,
  },
  {
    id: "tomato-pasta",
    title: "Tomato Vegetable Pasta",
    main: "wheat pasta",
    allergens: ["wheat"],
    topping: { name: "parmesan", allergens: ["dairy"] },
    diets: ["vegetarian"],
    canFreeze: true,
  },
  {
    id: "tofu-rice-bowl",
    title: "Tofu Rice Bowl",
    main: "tofu and rice",
    allergens: ["soy"],
    sauce: { name: "tamari", allergens: ["soy"] },
    diets: ["vegetarian", "vegan"],
    canFreeze: true,
  },
  {
    id: "chickpea-salad",
    title: "Chickpea Cucumber Salad",
    main: "chickpeas and cucumber",
    diets: ["vegetarian", "vegan"],
    utensils: true,
    refrigeratedHours: 24,
  },
  {
    id: "beef-taco-bowl",
    title: "Beef Taco Bowl",
    main: "seasoned beef and rice",
    topping: { name: "cheddar", allergens: ["dairy"] },
    canFreeze: true,
  },
  {
    id: "sunflower-rollups",
    title: "Sunflower Butter Roll-Ups",
    main: "wheat tortilla and sunflower butter",
    allergens: ["wheat"],
    crossContact: ["peanut", "tree_nut"],
  },
  {
    id: "mini-frittata",
    title: "Vegetable Mini Frittata",
    main: "baked egg and vegetables",
    allergens: ["egg", "dairy"],
    canFreeze: true,
  },
  {
    id: "polenta-beans",
    title: "Polenta and White Bean Squares",
    main: "polenta and white beans",
    diets: ["vegetarian", "vegan"],
    canFreeze: true,
    eatingMinutes: 10,
  },
];

export const MAIN_LUNCH_RECIPES: readonly Recipe[] = Object.freeze(seeds.map(recipe));
