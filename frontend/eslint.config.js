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

/** Tutto il codice dell'interfaccia (fase I2). */
const I18N_FILES = ["src/**/*.{ts,tsx}"];

/**
 * Eccezioni: i file di traduzione (contengono i testi), i test (verificano i testi) e lo
 * schema dell'API generato.
 */
const I18N_IGNORES = ["src/i18n/locales/**", "src/**/*.test.{ts,tsx}", "src/api/schema.d.ts"];

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
    ignores: I18N_IGNORES,
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
              // chiavi del browser e selettori
              "localStorage\\.\\w+",
              "matchMedia",
              // locale tecniche di Intl (date in formato ISO, ora di Roma)
              "Intl\\.\\w+",
              "querySelector(All)?",
              // media query
              "useMediaQuery",
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
              // grafici (colori, tratteggi) e formati dei campi
              "stroke",
              "fill",
              "strokeDasharray",
              "pattern",
            ],
          },
          "object-properties": {
            exclude: [
              "[A-Z_-]+",
              "queryKey",
              "status",
              "type",
              "value",
              "path",
              "id",
              // fuso orario di Intl
              "timeZone",
              // proprietà di stile dei grafici
              "stroke",
              "fill",
              "color",
            ],
          },
          words: {
            exclude: [
              ...I18N_DEFAULT_WORDS,
              // identificatori: codici, chiavi, percorsi, classi CSS (minuscole, senza spazi)
              "^[a-z0-9_./:@#*-]+$",
              // chiavi in camelCase (es. sezioni dei testi)
              "^[a-z][a-zA-Z0-9]*$",
              // colori dei grafici: variabili CSS
              "^var\\(--[\\w-]+\\)$",
              // esempi numerici nei campi ("123 456")
              "^[\\d\\s]+$",
              // direttiva dei componenti shadcn/ui
              "^use client$",
              // separatori e simboli tipografici (" · ", "—", "€", "…")
              "^[\\s·—–…€%+()/:,.]+$",
            ],
          },
          // nome della classe d'errore
          "class-properties": { exclude: ["name"] },
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
