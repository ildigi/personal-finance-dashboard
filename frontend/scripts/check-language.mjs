// Controllo "nessuna parola italiana" sulla demo in inglese (ADR 0006, fase I4).
//
//   node scripts/check-language.mjs [--base http://127.0.0.1:5181] [--lang en]
//
// Per ogni pagina fa lo screenshot con il testo (scripts/screenshot.mjs --text) e cerca le
// parole italiane: quelle che compaiono solo nei testi italiani (traduzioni del frontend e
// seed del database) più un elenco di parole comuni. I nomi propri ammessi sono in ALLOWED.
// Richiede frontend e backend della demo accesi; esce con 1 se trova qualcosa.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://127.0.0.1:5181" },
    lang: { type: "string", default: "en" },
  },
});

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const ROOT = join(FRONTEND, "..");
const SHOTS = join(FRONTEND, ".screenshots");

// Pagine della demo; la Panoramica comprende il riquadro "Da sistemare".
const PAGES = [
  ["overview", "/"],
  ["transactions", "/movimenti"],
  ["expenses", "/spese"],
  ["income", "/entrate"],
  ["investments", "/investimenti"],
  ["net-worth", "/patrimonio"],
  ["budgets", "/budget"],
  ["recurring", "/ricorrenze"],
  ["rules", "/regole"],
  ["settings", "/impostazioni"],
  ["privacy", "/privacy"],
  ["terms", "/termini"],
];

// Nomi propri che restano uguali in ogni lingua (banche, aziende, prodotti, codici) e parole
// inglesi scritte come una italiana ("Tue" = martedì, "tue" = tue).
const ALLOWED = new Set(["italia", "credit", "agricole", "enel", "vanguard", "tue"]);

// Le espressioni regolari delle regole ("matches /\b(affitto|rent)\b/") sono dati: le regole
// di sistema riconoscono apposta anche le causali italiane delle banche (SPEC §18, I4).
const PATTERN = /\/(?:\\.|[^/\n])+\/(?=\s|$)/g;

// Parole italiane comuni che i testi delle traduzioni potrebbero non contenere.
const COMMON = `il lo la le gli un una uno di da del della dei delle dal nel nella per con su
tra fra non che sono è e o ma più meno anche come dove quando oggi ieri mese anno giorno
conto conti spesa spese entrate uscite saldo movimento movimenti categoria categorie
bonifico giroconto ricarica stipendio affitto carta credito debito pagamento addebito
rimborso tasse canone mensile palestra abbonamento negozio prova regola regole`.split(/\s+/);

const words = (text) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2);

// Le stringhe tra virgolette dei file di traduzione, senza i segnaposto {{...}}.
function localeText(dir, file) {
  const source = readFileSync(join(dir, file), "utf8");
  return [...source.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)]
    .map((m) => m[2].replace(/\{\{[^}]*\}\}/g, " "))
    .join(" ");
}

function textsOf(lang) {
  const locales = join(FRONTEND, "src", "i18n", "locales");
  const parts = [localeText(locales, `${lang}.ts`)];
  for (const file of readdirSync(join(locales, lang)))
    parts.push(localeText(join(locales, lang), file));
  const seeds = join(ROOT, "database", "seeds", lang === "it" ? "" : lang);
  for (const file of ["categories.yaml", "income_classifications.yaml", "rules.yaml"]) {
    // Solo i valori di name/label: le espressioni regolari contengono parole di entrambe.
    const yaml = readFileSync(join(seeds, file), "utf8");
    parts.push([...yaml.matchAll(/\b(?:name|label):\s*([^,}\n]+)/g)].map((m) => m[1]).join(" "));
  }
  return parts.join(" ");
}

const english = new Set(words(textsOf("en")));
const italian = new Set(
  [...words(textsOf("it")), ...COMMON].filter((w) => !english.has(w) && !ALLOWED.has(w)),
);

let found = 0;
for (const [name, path] of PAGES) {
  const shot = `lang-${values.lang}-${name}`;
  const run = spawnSync(
    process.execPath,
    [
      join(FRONTEND, "scripts", "screenshot.mjs"),
      shot,
      "--path",
      path,
      "--lang",
      values.lang,
      "--text",
      "--base",
      values.base,
    ],
    { encoding: "utf8" },
  );
  if (run.status !== 0) {
    console.error(`${path}: screenshot non riuscito\n${run.stderr}`);
    found++;
    continue;
  }
  const text = readFileSync(join(SHOTS, `${shot}.txt`), "utf8");
  const hits = new Map();
  for (const line of text.split("\n")) {
    for (const w of words(line.replace(PATTERN, " "))) {
      if (italian.has(w) && !hits.has(w)) hits.set(w, line.trim().slice(0, 100));
    }
  }
  if (hits.size === 0) {
    console.log(`ok   ${path}`);
  } else {
    found += hits.size;
    console.log(`NO   ${path}`);
    for (const [w, line] of hits) console.log(`       "${w}" in: ${line}`);
  }
}
console.log(found === 0 ? "Nessuna parola italiana." : `Parole italiane trovate: ${found}`);
process.exit(found === 0 ? 0 : 1);
