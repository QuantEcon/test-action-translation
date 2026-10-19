import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fetchGoldens, verify } from '../lib/fetch.mjs';
import { rawUrl } from '../lib/manifest.mjs';

const bytesOf = (text) => Buffer.from(text, 'utf8');
const pinFor = (text, p) => ({ repo: 'QuantEcon/x', sha: 'c'.repeat(40), path: p, sha256: createHash('sha256').update(bytesOf(text)).digest('hex'), bytes: bytesOf(text).length });

function setup() {
  const files = { 'lectures/a.md': '# A\n\nEnglish.\n', 'seed/a.md': '# A\n\nSeed.\n', 'gold/a.md': '# A\n\nGold.\n' };
  const golden = {
    id: 'xx-a', lecture: 'a.md', kind: 'post-edited', seedModel: 'm', language: 'xx',
    source: pinFor(files['lectures/a.md'], 'lectures/a.md'),
    seed: pinFor(files['seed/a.md'], 'seed/a.md'),
    gold: pinFor(files['gold/a.md'], 'gold/a.md'),
  };
  const served = Object.fromEntries(Object.entries(files).map(([p, t]) => [rawUrl({ ...golden.source, path: p }), t]));
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (!(url in served)) return new Response('nope', { status: 404 });
    return new Response(served[url]);
  };
  const out = mkdtempSync(path.join(tmpdir(), 'goldens-test-'));
  return { golden, served, calls, fetchImpl, out };
}

test('fetches every pin, verifies it, writes the lecture copy and the lock', async (t) => {
  const { golden, calls, fetchImpl, out } = setup();
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const r = await fetchGoldens([golden], { out, fetchImpl });
  assert.deepEqual(r, { fetched: 3, kept: 0, total: 3 });
  assert.equal(calls.length, 3);
  assert.equal(readFileSync(path.join(out, 'xx-a', 'gold.md'), 'utf8'), '# A\n\nGold.\n');
  assert.equal(readFileSync(path.join(out, 'xx-a', 'src', 'a.md'), 'utf8'), '# A\n\nEnglish.\n');
  const lock = JSON.parse(readFileSync(path.join(out, 'lock.json'), 'utf8'));
  assert.equal(lock.goldens[0].pins.length, 3);
  // A second run keeps verified files and downloads nothing.
  const again = await fetchGoldens([golden], { out, fetchImpl });
  assert.deepEqual(again, { fetched: 0, kept: 3, total: 3 });
  assert.equal(calls.length, 3);
});

test('a byte mismatch fails loudly and the bad file is never written', async (t) => {
  const { golden, served, fetchImpl, out } = setup();
  t.after(() => rmSync(out, { recursive: true, force: true }));
  served[rawUrl(golden.gold)] = '# A\n\nTampered.\n';
  await assert.rejects(fetchGoldens([golden], { out, fetchImpl }), /xx-a gold: (size|sha256)/);
  assert.equal(existsSync(path.join(out, 'xx-a', 'gold.md')), false);
  assert.equal(existsSync(path.join(out, 'lock.json')), false);
});

test('a failed download is reported with its pin', async (t) => {
  const { golden, served, fetchImpl, out } = setup();
  t.after(() => rmSync(out, { recursive: true, force: true }));
  delete served[rawUrl(golden.seed)];
  await assert.rejects(fetchGoldens([golden], { out, fetchImpl }), /xx-a seed: HTTP 404/);
});

test('verify names the size and hash mismatches', () => {
  const pin = pinFor('abc', 'x.md');
  assert.equal(verify(bytesOf('abc'), pin), null);
  assert.match(verify(bytesOf('abcd'), pin), /size 4 != pinned 3/);
  assert.match(verify(bytesOf('abd'), pin), /sha256/);
});
