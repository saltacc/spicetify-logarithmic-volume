#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "manifest.json");
const requiredExtensionFields = ["name", "description", "preview", "main", "readme"];
const allowedRemote = /^https?:\/\//i;

function fail(message) {
  console.error(`publish check failed: ${message}`);
  process.exitCode = 1;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${path.relative(root, filePath)} is not valid JSON: ${error.message}`);
    return null;
  }
}

function checkRelativeFile(field, value) {
  if (allowedRemote.test(value)) return;

  const filePath = path.join(root, value);
  if (!fs.existsSync(filePath)) {
    fail(`manifest field "${field}" points to missing file: ${value}`);
  }
}

function checkManifestEntry(entry, index) {
  const label = index === null ? "manifest" : `manifest[${index}]`;

  for (const field of requiredExtensionFields) {
    if (!entry[field] || typeof entry[field] !== "string") {
      fail(`${label} is missing required string field "${field}"`);
    }
  }

  for (const field of ["preview", "main", "readme"]) {
    if (typeof entry[field] === "string") {
      checkRelativeFile(field, entry[field]);
    }
  }

  if (entry.authors && !Array.isArray(entry.authors)) {
    fail(`${label} field "authors" must be an array when present`);
  }

  if (entry.tags && !Array.isArray(entry.tags)) {
    fail(`${label} field "tags" must be an array when present`);
  }
}

const manifest = readJson(manifestPath);

if (manifest) {
  if (Array.isArray(manifest)) {
    manifest.forEach(checkManifestEntry);
  } else {
    checkManifestEntry(manifest, null);
  }
}

if (!process.exitCode) {
  console.log("publish check passed");
}
