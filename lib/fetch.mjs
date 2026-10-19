// Fetch the pinned golden files and verify every byte (sha256 and size) before use.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { pinsOf, rawUrl } from './manifest.mjs';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Write <out>/<id>/<role>.md for every pin of every golden, plus <out>/<id>/src/<lecture> (the
 * English source under its own name, ready for `translate init --source <dir>`), and
 * <out>/lock.json. Files already present with the right hash are kept. Any mismatch or failed
 * download is collected; the call throws once every golden has been tried.
 */
export async function fetchGoldens(goldens, { out, fetchImpl = globalThis.fetch, force = false, concurrency = 4, log = () => {} }) {
  mkdirSync(out, { recursive: true });
  const jobs = goldens.flatMap((g) => pinsOf(g).map((pin) => ({ g, pin })));
  const failures = [];
  let fetched = 0;
  let kept = 0;
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { g, pin } = jobs[next++];
      const dir = path.join(out, g.id);
      const file = path.join(dir, `${pin.role}.md`);
      mkdirSync(dir, { recursive: true });
      if (!force && existsSync(file) && verify(readFileSync(file), pin) === null) {
        kept++;
        continue;
      }
      try {
        const res = await fetchImpl(rawUrl(pin));
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${rawUrl(pin)}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const problem = verify(buf, pin);
        if (problem) throw new Error(`${problem} (${rawUrl(pin)})`);
        const tmp = `${file}.tmp-${process.pid}`;
        writeFileSync(tmp, buf);
        renameSync(tmp, file);
        fetched++;
        log(`fetched ${g.id} ${pin.role}`);
      } catch (e) {
        failures.push(`${g.id} ${pin.role}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  // The English source under its lecture name, for translate init.
  for (const g of goldens) {
    const source = path.join(out, g.id, 'source.md');
    if (!existsSync(source) || verify(readFileSync(source), g.source) !== null) continue;
    mkdirSync(path.join(out, g.id, 'src'), { recursive: true });
    copyFileSync(source, path.join(out, g.id, 'src', g.lecture));
  }
  if (failures.length) {
    throw new Error(`${failures.length} pin(s) failed verification or download:\n  ${failures.join('\n  ')}`);
  }
  const lock = {
    schema: 'test-action-translation/goldens-lock/1',
    goldens: goldens.map((g) => ({ id: g.id, pins: pinsOf(g).map(({ role, repo, sha, path: p, sha256: h, bytes }) => ({ role, repo, sha, path: p, sha256: h, bytes })) })),
  };
  writeFileSync(path.join(out, 'lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  return { fetched, kept, total: jobs.length };
}

/** null when the bytes match the pin, else a description of the mismatch. */
export function verify(buf, pin) {
  if (buf.length !== pin.bytes) return `size ${buf.length} != pinned ${pin.bytes}`;
  const h = sha256(buf);
  if (h !== pin.sha256) return `sha256 ${h} != pinned ${pin.sha256}`;
  return null;
}
