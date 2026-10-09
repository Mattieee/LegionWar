import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Le moteur doit rester déterministe : aucune source d'aléa ou de temps non contrôlée.
    files: ["packages/engine/src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        "Date",
        "performance",
        "setTimeout",
        "setInterval",
        "fetch",
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Utiliser PseudoRandom." },
        { object: "Math", property: "pow", message: "Utiliser DetMath.pow." },
        { object: "Math", property: "exp", message: "Utiliser DetMath.exp." },
        { object: "Math", property: "log", message: "Utiliser DetMath.log." },
        { object: "Math", property: "sin", message: "Non déterministe entre moteurs JS." },
        { object: "Math", property: "cos", message: "Non déterministe entre moteurs JS." },
        { object: "Math", property: "tan", message: "Non déterministe entre moteurs JS." },
        { object: "Math", property: "atan2", message: "Non déterministe entre moteurs JS." },
        { object: "Math", property: "hypot", message: "Non déterministe entre moteurs JS." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "BinaryExpression[operator='**']",
          message: "L'opérateur ** n'est pas garanti déterministe : utiliser DetMath.pow.",
        },
      ],
    },
  },
  {
    files: ["packages/client/src/**/*.ts"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["packages/server/**/*.ts", "packages/*/test/**/*.ts", "*.config.*", "tools/**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
