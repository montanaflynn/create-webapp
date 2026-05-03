import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Apply the jsx-a11y recommended rule set to our own code only. Shadcn
  // primitives (src/components/ui, src/hooks) are vendored upstream and
  // get refreshed by `npx shadcn add` — we don't want lint to churn on them.
  // Spread only the rules object — Next already registered the plugin, and
  // re-registering throws "Cannot redefine plugin" in @eslint/config-array.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**", "src/hooks/**"],
    rules: { ...jsxA11y.flatConfigs.recommended.rules },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
