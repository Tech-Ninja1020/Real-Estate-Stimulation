import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // The engine must stay pure and deterministic.
    files: ["engine/**/*.ts"],
    ignores: ["engine/**/*.test.ts", "engine/__tests__/**"],
    rules: {
      "no-restricted-globals": ["error", "window", "document", "localStorage"],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "The engine must be deterministic." },
        { object: "Date", property: "now", message: "The engine must be deterministic." },
      ],
      "no-restricted-imports": [
        "error",
        { patterns: ["react", "react-dom", "next", "next/*", "framer-motion"] },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**"]),
]);
