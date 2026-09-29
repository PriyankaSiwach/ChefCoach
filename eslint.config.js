import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "ios/**", "node_modules/**", ".next/**", "src/lib/mealLibrary.ts"],
  },
  {
    files: [
      "src/lib/**/*.ts",
      "src/test/**/*.ts",
      "src/**/*.test.ts",
      "server/**/*.test.ts",
    ],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["server/**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      globals: globals.node,
      sourceType: "module",
    },
  }
);
