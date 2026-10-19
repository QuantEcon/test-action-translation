// Load and validate goldens/manifest.yml (schema test-action-translation/goldens/1).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const SCHEMA = 'test-action-translation/goldens/1';
export const KINDS = ['hand', 'post-edited', 'edition'];
export const PIN_ROLES = ['source', 'seed', 'gold', 'editorOnly', 'origin'];
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_MANIFEST = path.join(REPO_ROOT, 'goldens', 'manifest.yml');

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const LOCALIZE = /^(none|default|[a-z0-9-]+(,[a-z0-9-]+)*)$/;

export function loadManifest(file = DEFAULT_MANIFEST) {
  const manifest = parse(readFileSync(file, 'utf8'));
  validateManifest(manifest);
  return manifest;
}

/** Throws one Error listing every problem found; returns the manifest when it is valid. */
export function validateManifest(manifest) {
  const errors = [];
  const fail = (where, msg) => errors.push(`${where}: ${msg}`);
  if (!manifest || typeof manifest !== 'object') throw new Error('manifest: not a mapping');
  if (manifest.schema !== SCHEMA) fail('schema', `expected ${SCHEMA}, got ${manifest.schema}`);
  const languages = manifest.languages;
  if (!languages || typeof languages !== 'object' || !Object.keys(languages).length) {
    fail('languages', 'missing or empty');
  }
  const seen = new Set();
  for (const [code, lang] of Object.entries(languages ?? {})) {
    const at = `languages.${code}`;
    if (typeof lang?.name !== 'string' || !lang.name) fail(at, 'name is required');
    if (typeof lang?.localize !== 'string' || !LOCALIZE.test(lang.localize)) {
      fail(at, `localize must be none, default or a rule list (got ${lang?.localize})`);
    }
    if (typeof lang?.verbatimDirectives !== 'boolean') fail(at, 'verbatimDirectives must be true or false');
    if (!Array.isArray(lang?.goldens) || !lang.goldens.length) {
      fail(at, 'goldens must be a non-empty list');
      continue;
    }
    lang.goldens.forEach((g, i) => validateGolden(g, `${at}.goldens[${i}]`, code, seen, fail));
  }
  if (errors.length) throw new Error(`invalid manifest:\n  ${errors.join('\n  ')}`);
  return manifest;
}

function validateGolden(g, at, code, seen, fail) {
  if (typeof g?.id !== 'string' || !g.id.startsWith(`${code}-`)) fail(at, `id must start with "${code}-"`);
  else if (seen.has(g.id)) fail(at, `duplicate id ${g.id}`);
  else seen.add(g.id);
  if (!KINDS.includes(g?.kind)) fail(at, `kind must be one of ${KINDS.join(', ')}`);
  for (const role of Object.keys(g ?? {})) {
    if (['id', 'lecture', 'kind', 'seedModel', 'inSample', 'notes'].includes(role)) continue;
    if (!PIN_ROLES.includes(role)) fail(at, `unknown field ${role}`);
  }
  for (const role of PIN_ROLES) if (g?.[role] !== undefined) validatePin(g[role], `${at}.${role}`, fail);
  if (!g?.source) fail(at, 'source pin is required');
  if (!g?.gold) fail(at, 'gold pin is required');
  if (g?.source && g.lecture !== path.basename(g.source.path ?? '')) {
    fail(at, `lecture (${g.lecture}) must be the source file's name`);
  }
  if (g?.kind === 'post-edited') {
    if (typeof g.seedModel !== 'string' || !g.seedModel) fail(at, 'post-edited needs seedModel');
    if (!g.seed) fail(at, 'post-edited needs a seed pin');
  } else if (g?.seedModel !== undefined && g?.seedModel !== null) {
    fail(at, `seedModel is only for post-edited goldens`);
  }
  if (g?.editorOnly && g?.kind !== 'post-edited') fail(at, 'editorOnly is only for post-edited goldens');
  if (g?.inSample !== undefined && typeof g.inSample !== 'boolean') fail(at, 'inSample must be true or false');
}

function validatePin(pin, at, fail) {
  if (!pin || typeof pin !== 'object') return fail(at, 'not a mapping');
  if (!REPO.test(pin.repo ?? '')) fail(at, `repo must be owner/name (got ${pin.repo})`);
  if (!SHA.test(pin.sha ?? '')) fail(at, 'sha must be a full 40-hex commit');
  if (typeof pin.path !== 'string' || !pin.path || pin.path.startsWith('/') || pin.path.split('/').includes('..')) {
    fail(at, `path must be relative with no ".." (got ${pin.path})`);
  }
  if (!SHA256.test(pin.sha256 ?? '')) fail(at, 'sha256 must be 64 hex');
  if (!Number.isInteger(pin.bytes) || pin.bytes <= 0) fail(at, 'bytes must be a positive integer');
}

/** The goldens as one flat list, each carrying its language settings. */
export function goldensOf(manifest, { languages, ids } = {}) {
  const out = [];
  for (const [language, lang] of Object.entries(manifest.languages)) {
    if (languages && !languages.includes(language)) continue;
    for (const g of lang.goldens) {
      if (ids && !ids.includes(g.id)) continue;
      out.push({ ...g, language, localize: lang.localize, verbatimDirectives: lang.verbatimDirectives });
    }
  }
  return out;
}

/** Every pin of one golden, with its role. */
export function pinsOf(golden) {
  return PIN_ROLES.filter((role) => golden[role]).map((role) => ({ role, ...golden[role] }));
}

export const rawUrl = (pin) => `https://raw.githubusercontent.com/${pin.repo}/${pin.sha}/${pin.path}`;
