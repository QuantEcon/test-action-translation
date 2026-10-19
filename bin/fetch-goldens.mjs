#!/usr/bin/env node
// Fetch and verify the golden set.
//
//   node bin/fetch-goldens.mjs [--out DIR] [--languages ml,fr] [--ids ml-numpy,...] [--force]
//   node bin/fetch-goldens.mjs --check        # validate the manifest only (no network)
//
// Files land in DIR (default .goldens/, git-ignored) as <id>/{source,seed,gold,editorOnly,origin}.md
// plus <id>/src/<lecture> for `translate init`. Every file is checked against its pinned sha256 and
// size; a mismatch is an error, never a warning. Behind an HTTPS proxy, set NODE_USE_ENV_PROXY=1.
// Exit 0 = all verified; 1 = a download or verification failed; 2 = usage or manifest error.
import path from 'node:path';
import { DEFAULT_MANIFEST, REPO_ROOT, goldensOf, loadManifest } from '../lib/manifest.mjs';
import { fetchGoldens } from '../lib/fetch.mjs';

function parseArgs(argv) {
  const opts = { out: path.join(REPO_ROOT, '.goldens'), manifest: DEFAULT_MANIFEST };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) usage(`${a} needs a value`);
      return v;
    };
    if (a === '--out') opts.out = path.resolve(value());
    else if (a === '--manifest') opts.manifest = path.resolve(value());
    else if (a === '--languages') opts.languages = value().split(',').filter(Boolean);
    else if (a === '--ids') opts.ids = value().split(',').filter(Boolean);
    else if (a === '--force') opts.force = true;
    else if (a === '--check') opts.check = true;
    else if (a === '-h' || a === '--help') {
      console.log('usage: fetch-goldens.mjs [--out DIR] [--languages a,b] [--ids a,b] [--force] [--check] [--manifest FILE]');
      process.exit(0);
    } else usage(`unknown argument ${a}`);
  }
  return opts;
}

function usage(msg) {
  console.error(`fetch-goldens: ${msg} (try --help)`);
  process.exit(2);
}

const opts = parseArgs(process.argv.slice(2));
let manifest;
try {
  manifest = loadManifest(opts.manifest);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const goldens = goldensOf(manifest, { languages: opts.languages, ids: opts.ids });
if (opts.languages) {
  const unknown = opts.languages.filter((l) => !manifest.languages[l]);
  if (unknown.length) usage(`unknown language(s): ${unknown.join(', ')}`);
}
if (!goldens.length) usage('no goldens selected');

if (opts.check) {
  const counts = {};
  for (const g of goldens) counts[`${g.language} ${g.kind}`] = (counts[`${g.language} ${g.kind}`] ?? 0) + 1;
  console.log(`manifest OK: ${goldens.length} goldens`);
  for (const [k, n] of Object.entries(counts)) console.log(`  ${k.padEnd(22)} ${n}`);
  process.exit(0);
}

try {
  const { fetched, kept, total } = await fetchGoldens(goldens, { out: opts.out, force: opts.force, log: (m) => console.log(m) });
  console.log(`✓ ${total} files verified (${fetched} fetched, ${kept} already present) in ${opts.out}`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
