import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored MapLibre worker, copied from node_modules by
    // scripts/sync-maplibre-worker.mjs — not ours to lint.
    "public/maplibre/**",
  ]),
  {
    rules: {
      /**
       * Both of these fire on patterns that are deliberate here, and neither
       * can be satisfied by rearranging the code — the first traces through an
       * async loader, so it reports even where nothing is set synchronously.
       *
       * set-state-in-effect: every list screen fetches on mount and, in two
       *   cases, polls. Silencing it properly means a data-fetching library or
       *   Suspense, which is a real change worth making deliberately rather
       *   than under lint pressure. Kept visible as a warning until then.
       *
       * purity: ExpiryBadge reads Date.now() while rendering, which is the
       *   point — "4 days left" is relative to now, and it should recompute
       *   whenever the row re-renders.
       */
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
