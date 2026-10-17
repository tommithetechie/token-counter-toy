#!/usr/bin/env node
/**
 * Record docs/demo.gif.
 *
 * Serves the repo, types a sample into #input, and writes a looping GIF.
 * Opens index.html when it exists, otherwise tools/demo-fixture.html.
 *
 * From the repo root, after `npm install` and `npx playwright install chromium`
 * inside tools/:
 *
 *   node tools/record-demo.mjs
 *   node tools/record-demo.mjs --page tools/demo-fixture.html
 *   node tools/record-demo.mjs --out docs/demo.gif --text "Hello tokens"
 *
 * Requires ffmpeg on PATH. The GIF is kept under 3 MB.
 */

import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolsDir, "..");
const MAX_BYTES = 3 * 1024 * 1024;
const SAMPLE = "Hello, token counter! A beige shell, a teal screen, and yellow type.";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".gif": "image/gif",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

function readFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function defaultPage() {
  const appPage = path.join(repoRoot, "index.html");
  return fs
    .access(appPage)
    .then(() => "index.html")
    .catch(() => "tools/demo-fixture.html");
}

function startServer(root) {
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const filePath = path.normalize(path.join(root, pathname));
    if (filePath !== root && !filePath.startsWith(rootWithSep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const stream = createReadStream(filePath);
    stream.on("error", () => {
      res.writeHead(404);
      res.end("Not found");
    });
    stream.on("open", () => {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
    });
    stream.pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not bind the static server"));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

async function encodeGif(framesDir, outFile, maxColors) {
  const vf = [
    "scale=760:-1:flags=lanczos,split[s0][s1]",
    `[s0]palettegen=max_colors=${maxColors}:stats_mode=diff[p]`,
    "[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
  ].join(";");
  await execFileAsync("ffmpeg", [
    "-y",
    "-framerate",
    "5",
    "-i",
    path.join(framesDir, "frame-%03d.png"),
    "-vf",
    vf,
    "-loop",
    "0",
    outFile,
  ]);
}

async function main() {
  const args = process.argv.slice(2);
  const pagePath = readFlag(args, "--page") ?? (await defaultPage());
  const outArg = readFlag(args, "--out") ?? "docs/demo.gif";
  const sample = readFlag(args, "--text") ?? SAMPLE;
  const outFile = path.resolve(repoRoot, outArg);
  const framesDir = path.join(toolsDir, ".frames");

  await fs.rm(framesDir, { recursive: true, force: true });
  await fs.mkdir(framesDir, { recursive: true });
  await fs.mkdir(path.dirname(outFile), { recursive: true });

  const { server, port } = await startServer(repoRoot);
  const browser = await chromium.launch({ headless: true });
  let frame = 0;

  try {
    const page = await browser.newPage({
      viewport: { width: 820, height: 640 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const url = `http://127.0.0.1:${port}/${pagePath.split(path.sep).join("/")}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    const input = page.locator("#input");
    await input.waitFor({ state: "visible", timeout: 10_000 });
    const app = page.locator("#app");

    async function capture(copies = 1) {
      frame += 1;
      const first = path.join(framesDir, `frame-${String(frame).padStart(3, "0")}.png`);
      await app.screenshot({ path: first });
      for (let extra = 1; extra < copies; extra += 1) {
        frame += 1;
        const copy = path.join(framesDir, `frame-${String(frame).padStart(3, "0")}.png`);
        await fs.copyFile(first, copy);
      }
    }

    await input.fill("");
    await input.dispatchEvent("input");
    await capture(2);

    await input.click();
    const chunks = sample.split(/(\s+)/).filter(Boolean);
    for (const chunk of chunks) {
      await input.pressSequentially(chunk, { delay: 12 });
      await page.waitForTimeout(80);
      await capture(2);
    }
    await page.waitForTimeout(200);
    await capture(10);

    try {
      await encodeGif(framesDir, outFile, 64);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("ENOENT")) {
        throw new Error("ffmpeg is required to encode the GIF and was not found on PATH");
      }
      throw error;
    }

    let size = (await fs.stat(outFile)).size;
    if (size > MAX_BYTES) {
      await encodeGif(framesDir, outFile, 32);
      size = (await fs.stat(outFile)).size;
    }
    if (size > MAX_BYTES) {
      throw new Error(`GIF is ${size} bytes, over the ${MAX_BYTES} byte limit`);
    }

    console.log(`Recorded ${path.relative(repoRoot, outFile)} from /${pagePath} (${size} bytes, ${frame} frames)`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(framesDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
