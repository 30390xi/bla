#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkgPath = resolve(root, "package.json");
const identityPath = resolve(root, "src/identity.ts");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const version = String(pkg.version);

const identityText = readFileSync(identityPath, "utf8");
const updated = identityText.replace(
  /version:\s*"[^"]+"/,
  `version: "${version}"`,
);

if (updated !== identityText) {
  writeFileSync(identityPath, updated, "utf8");
  console.log(`Synced BLA_IDENTITY.version -> ${version}`);
} else {
  console.log(`BLA_IDENTITY.version already at ${version}`);
}
