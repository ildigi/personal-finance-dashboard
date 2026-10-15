// Rigenera il client tipizzato dall'API del backend:
// 1) esporta lo schema OpenAPI (senza avviare il server) in src/api/openapi.json
// 2) genera i tipi TypeScript in src/api/schema.d.ts
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import openapiTS, { astToString } from "openapi-typescript";

const backend = fileURLToPath(new URL("../../backend", import.meta.url));

const schema = execFileSync("uv", ["run", "python", "-m", "app.export_openapi"], {
  cwd: backend,
  encoding: "utf-8",
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
}).replace(/\r\n/g, "\n"); // su Windows stdout usa CRLF: il repo vuole LF
writeFileSync(new URL("../src/api/openapi.json", import.meta.url), schema, "utf-8");

// defaultNonNullable: false → nei corpi delle richieste i campi con default restano facoltativi.
const ast = await openapiTS(JSON.parse(schema), { defaultNonNullable: false });
const header = "// Generato da scripts/generate-api.mjs — non modificare a mano.\n\n";
writeFileSync(
  new URL("../src/api/schema.d.ts", import.meta.url),
  header + astToString(ast),
  "utf-8",
);
console.log("Client API rigenerato: src/api/openapi.json, src/api/schema.d.ts");
