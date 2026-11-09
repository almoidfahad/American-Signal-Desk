import { defineConfig } from "eslint/config";
import next from "eslint-config-next";

export default defineConfig([
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"],
  },
  ...next,
  {
    rules: {
      "no-console": ["error", { allow: ["error", "warn"] }],
      "no-restricted-syntax": [
        "error",
        {
          // Authorization must be decided on the server, never by rendering a component.
          selector: "JSXAttribute[name.name='data-authorized']",
          message: "Do not encode authorization decisions in markup.",
        },
      ],
    },
  },
  {
    // Long-lived Node processes and CLIs: console output is the user interface there,
    // not a debugging leftover. The app itself keeps the strict rule.
    files: ["workers/**/*.ts", "scripts/**/*.{ts,mjs}"],
    rules: { "no-console": "off" },
  },
]);
