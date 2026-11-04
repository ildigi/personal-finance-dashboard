// Screenshot dell'app con Chrome headless via DevTools Protocol (nessuna dipendenza).
// Serve a verificare l'interfaccia su PC e telefono emulato, in tema chiaro e scuro.
//
//   node scripts/screenshot.mjs <nome> [--path /movimenti] [--width 1440] [--height 1000]
//        [--mobile] [--dark] [--scrollbars] [--lang en|it] [--text]
//        [--set fd-period=last_3_months] [--out ../docs/screenshots]
//        [--eval "codice JS da eseguire prima dello scatto"]
//
// Le immagini finiscono in frontend/.screenshots/ (ignorata da Git; altrove con --out); con
// --text anche il testo visibile della pagina, in <nome>.txt (lo usa
// scripts/check-language.mjs). --set (ripetibile) scrive una preferenza in localStorage prima
// che l'app parta. Richiede `pnpm dev` acceso. I messaggi console.error della pagina vengono
// stampati: utili per misurare.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    path: { type: "string", default: "/" },
    width: { type: "string", default: "1440" },
    height: { type: "string", default: "1000" },
    mobile: { type: "boolean", default: false },
    dark: { type: "boolean", default: false },
    scrollbars: { type: "boolean", default: false },
    eval: { type: "string" },
    lang: { type: "string" },
    text: { type: "boolean", default: false },
    set: { type: "string", multiple: true, default: [] },
    out: { type: "string" },
    base: { type: "string", default: "https://127.0.0.1:5173" },
  },
});
const name = positionals[0] ?? "screenshot";
// Git Bash converte "/movimenti" in "C:/Program Files/Git/movimenti": si annulla la conversione.
const pagePath = values.path.replace(/^[A-Za-z]:\/.*?\/Git(?=\/|$)/, "") || "/";

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
].filter(Boolean);
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
if (!chromePath) throw new Error("Chrome non trovato: imposta CHROME_PATH");

const outDir = values.out
  ? pathToFileURL(resolve(values.out) + sep)
  : new URL("../.screenshots/", import.meta.url);
mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "fd-chrome-"));
const port = 9300 + Math.floor(Math.random() * 600);

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    ...(values.scrollbars ? [] : ["--hide-scrollbars"]),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function devtools(path, method = "GET") {
  for (let i = 0; i < 50; i++) {
    try {
      return await (await fetch(`http://127.0.0.1:${port}${path}`, { method })).json();
    } catch {
      await sleep(200);
    }
  }
  throw new Error("Chrome non risponde");
}

try {
  const target = await devtools("/json/new?about:blank", "PUT");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) {
      events.push(msg);
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        console.log(msg.params.args.map((a) => a.value ?? a.description).join(" "));
      }
      if (msg.method === "Runtime.exceptionThrown") {
        console.log("ECCEZIONE:", msg.params.exceptionDetails.exception?.description);
      }
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const msgId = ++id;
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: Number(values.width),
    height: Number(values.height),
    deviceScaleFactor: values.mobile ? 2 : 1,
    mobile: values.mobile,
  });
  if (values.mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: values.dark ? "dark" : "light" }],
  });
  // Preferenze scritte prima che l'app parta (le legge all'avvio): lingua e --set.
  const storage = values.set.map((pair) => pair.split(/=(.*)/s).slice(0, 2));
  if (values.lang) storage.push(["fd-language", values.lang]);
  if (storage.length > 0) {
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: storage
        .map(
          ([key, value]) =>
            `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)});`,
        )
        .join("\n"),
    });
  }
  await send("Page.navigate", { url: values.base + pagePath });
  for (let i = 0; i < 100 && !events.some((e) => e.method === "Page.loadEventFired"); i++) {
    await sleep(100);
  }
  await sleep(1500);
  if (values.eval) {
    await send("Runtime.evaluate", { expression: values.eval, awaitPromise: true });
    await sleep(700);
  }
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const file = new URL(`${name}.png`, outDir);
  writeFileSync(file, Buffer.from(shot.result.data, "base64"));
  if (values.text) {
    // Testo visibile più attributi letti dagli screen reader e dai tooltip.
    const attributes = ["aria-label", "title", "placeholder"];
    const expression = `[
      document.title,
      document.body.innerText,
      ...[...document.querySelectorAll("[aria-label],[title],[placeholder]")].flatMap((el) =>
        ${JSON.stringify(attributes)}.map((name) => el.getAttribute(name) ?? ""),
      ),
    ].join(String.fromCharCode(10))`;
    const result = await send("Runtime.evaluate", { expression, returnByValue: true });
    writeFileSync(new URL(`${name}.txt`, outDir), String(result.result.result.value ?? ""));
  }
  console.log(file.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
