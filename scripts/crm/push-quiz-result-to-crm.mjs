#!/usr/bin/env node
/**
 * Ручная догрузка лида после «Показать результат» (тот же JSON, что в crm-lead-upsert).
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_FUNCTIONS_URL = "https://<project-ref>.supabase.co/functions/v1"
 *   node .\scripts\crm\push-quiz-result-to-crm.mjs .\scripts\crm\examples\quiz-result-shown.payload.json
 *
 * Функция `crm-lead-upsert` в проекте с verify_jwt = false — заголовки не обязательны.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const base = process.env.SUPABASE_FUNCTIONS_URL?.trim().replace(/\/+$/, "");
if (!base) {
  console.error("Set SUPABASE_FUNCTIONS_URL, e.g. https://xxxx.supabase.co/functions/v1");
  process.exit(1);
}

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: node push-quiz-result-to-crm.mjs <payload.json>");
  process.exit(1);
}

const abs = path.resolve(process.cwd(), fileArg);
const raw = await readFile(abs, "utf8");
let body;
try {
  body = JSON.parse(raw);
} catch {
  console.error("Invalid JSON in", abs);
  process.exit(1);
}

const url = `${base}/crm-lead-upsert`;
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text };
}

console.log(res.status, JSON.stringify(json, null, 2));
process.exit(res.ok ? 0 : 1);
