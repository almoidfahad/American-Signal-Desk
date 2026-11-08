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
    // The worker is a long-lived Node process; console output goes to its log stream.
    files: ["workers/**/*.ts", "scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
]);
