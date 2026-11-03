import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";
import i18next from "eslint-plugin-i18next";
import i18nextDefaults from "eslint-plugin-i18next/lib/options/defaults.js";

const I18N_DEFAULT_CALLEES = i18nextDefaults.callees.exclude;
const I18N_DEFAULT_ATTRIBUTES = i18nextDefaults["jsx-attributes"].exclude;
const I18N_DEFAULT_WORDS = i18nextDefaults.words.exclude;

/** File già tradotti (fase I1: shell e Impostazioni). */
const I18N_FILES = [
  "src/app/**/*.{ts,tsx}",
  "src/api/client.ts",
  "src/components/layout/!(LegalLayout).{ts,tsx}",
  "src/components/ui/sheet.tsx",
  "src/features/auth/AccessCard.tsx",
  "src/features/auth/queries.ts",
  "src/features/banks/**/*.{ts,tsx}",
  "src/features/categories/**/*.{ts,tsx}",
  "src/features/merchants/**/*.{ts,tsx}",
  "src/features/sync/**/*.{ts,tsx}",
  "src/features/transactions/components/CategoryPicker.tsx",
  "src/lib/format.ts",
  "src/lib/period.ts",
  "src/lib/preferences.ts",
  "src/pages/SettingsPage.tsx",
];

export default tseslint.config(
  { ignores: ["dist", "coverage", "src/api/schema.d.ts"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
    },
  },
  {
    // Componenti shadcn/ui: generati, esportano anche varianti.
    files: ["src/components/ui/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // Niente testi fissi nell'interfaccia: passano da `t()` (ADR 0006). La regola vale per i
    // file già tradotti e si allarga fase per fase (SPEC §18).
    files: I18N_FILES,
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "all",
          // Eccezioni, con il motivo:
          callees: {
            exclude: [
              ...I18N_DEFAULT_CALLEES,
              // classi CSS
              "cn",
              "cva",
              // errori per chi sviluppa, mai mostrati come testo dell'interfaccia
              "Error",
              // chiavi del browser e selettori
              "localStorage\\.\\w+",
              "matchMedia",
              "querySelector(All)?",
              // percorsi dell'API (openapi-fetch) e chiavi delle query
              "api\\.(GET|POST|PUT|PATCH|DELETE)",
              "invalidateQueries",
            ],
          },
          "jsx-attributes": {
            exclude: [
              ...I18N_DEFAULT_ATTRIBUTES,
              // valori tecnici, non testo
              "to",
              "href",
              "variant",
              "size",
              "side",
              "align",
              "role",
              "lang",
              "value",
              "htmlFor",
              "i18nKey",
              "data-\\w+",
              "autoComplete",
              "inputMode",
            ],
          },
          "object-properties": {
            exclude: ["[A-Z_-]+", "queryKey", "status", "type", "value", "path", "id"],
          },
          words: {
            exclude: [
              ...I18N_DEFAULT_WORDS,
              // identificatori: codici, chiavi, percorsi, classi CSS senza spazi
              "^[\\w./:@#*-]+$",
              // direttiva dei componenti shadcn/ui
              "^use client$",
              // separatori e simboli tipografici (" · ", "—", "€", "…")
              "^[\\s·—–…€%+()/:,.]+$",
            ],
          },
        },
      ],
    },
  },
  {
    files: ["*.js", "scripts/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
);
