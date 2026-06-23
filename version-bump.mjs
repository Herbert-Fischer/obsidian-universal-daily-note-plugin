import { readFileSync, writeFileSync } from "node:fs";

const manifestPath = "manifest.json";
const versionsPath = "versions.json";

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const versions = JSON.parse(readFileSync(versionsPath, "utf8"));

const current = manifest.version;
const parts = current.split(".").map((n) => Number(n));
parts[2] = (parts[2] ?? 0) + 1;
const next = parts.join(".");

manifest.version = next;
versions[next] = manifest.minAppVersion;

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + "\n");

// eslint-disable-next-line no-console
console.log(`${current} -> ${next}`);
