// ESLint flat config: browser code in src/, Node code in scripts/, test/,
// and services/sam31/*.mjs. The front end is vanilla JS concatenated by
// scripts/build.mjs, so src/ is linted as scripts (not modules) and the
// rules stay to the security-relevant set; Node files get unused-var
// checks too. No framework plugins.
import globals from "globals";

export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser },
    },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
    },
  },
  {
    files: ["scripts/**/*.js", "test/**/*.mjs", "services/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-eval": "error",
    },
  },
];
