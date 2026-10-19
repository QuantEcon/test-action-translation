import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goldensOf, loadManifest, pinsOf, validateManifest, KINDS } from '../lib/manifest.mjs';

const manifest = loadManifest();

test('the committed manifest validates', () => {
  const all = goldensOf(manifest);
  assert.ok(all.length >= 18, `expected at least 18 goldens, got ${all.length}`);
  for (const code of ['ml', 'fr', 'zh-cn', 'fa']) assert.ok(manifest.languages[code], `language ${code}`);
  for (const g of all) assert.ok(KINDS.includes(g.kind));
});

test('every post-edited golden carries its seed and seed model; hand and edition goldens do not', () => {
  for (const g of goldensOf(manifest)) {
    if (g.kind === 'post-edited') {
      assert.ok(g.seed, `${g.id} seed`);
      assert.ok(g.seedModel, `${g.id} seedModel`);
    } else {
      assert.equal(g.seed, undefined, `${g.id} has a seed`);
      assert.ok(g.seedModel === undefined || g.seedModel === null, `${g.id} has a seedModel`);
    }
  }
});

test('the ml hand gold is pinned to its upstream original too', () => {
  const [g] = goldensOf(manifest, { ids: ['ml-getting_started'] });
  assert.equal(g.kind, 'hand');
  assert.equal(g.origin.sha256, g.gold.sha256);
});

test('goldensOf filters by language and id, and pinsOf lists roles', () => {
  const ml = goldensOf(manifest, { languages: ['ml'] });
  assert.ok(ml.length && ml.every((g) => g.language === 'ml' && g.localize === 'none' && g.verbatimDirectives === true));
  const [numpy] = goldensOf(manifest, { ids: ['ml-numpy'] });
  assert.deepEqual(pinsOf(numpy).map((p) => p.role), ['source', 'seed', 'gold', 'editorOnly']);
});

const pin = (over = {}) => ({ repo: 'o/r', sha: 'a'.repeat(40), path: 'lectures/x.md', sha256: 'b'.repeat(64), bytes: 10, ...over });
const base = () => ({
  schema: 'test-action-translation/goldens/1',
  languages: {
    xx: {
      name: 'Test',
      localize: 'none',
      verbatimDirectives: false,
      goldens: [{ id: 'xx-x', lecture: 'x.md', kind: 'post-edited', seedModel: 'm', source: pin(), seed: pin(), gold: pin() }],
    },
  },
});

test('validateManifest accepts a minimal valid manifest', () => {
  assert.doesNotThrow(() => validateManifest(base()));
});

for (const [name, mutate, message] of [
  ['wrong schema', (m) => { m.schema = 'other/1'; }, /schema/],
  ['short sha', (m) => { m.languages.xx.goldens[0].gold.sha = 'abc123'; }, /40-hex/],
  ['bad sha256', (m) => { m.languages.xx.goldens[0].gold.sha256 = 'nope'; }, /sha256/],
  ['zero bytes', (m) => { m.languages.xx.goldens[0].gold.bytes = 0; }, /bytes/],
  ['path traversal', (m) => { m.languages.xx.goldens[0].gold.path = '../x.md'; }, /path/],
  ['duplicate id', (m) => { m.languages.xx.goldens.push(structuredClone(m.languages.xx.goldens[0])); }, /duplicate/],
  ['post-edited without seed', (m) => { delete m.languages.xx.goldens[0].seed; }, /seed pin/],
  ['seedModel on an edition golden', (m) => { Object.assign(m.languages.xx.goldens[0], { kind: 'edition' }); delete m.languages.xx.goldens[0].seed; }, /only for post-edited/],
  ['unknown field', (m) => { m.languages.xx.goldens[0].extra = pin(); }, /unknown field/],
  ['lecture not the source name', (m) => { m.languages.xx.goldens[0].lecture = 'y.md'; }, /lecture/],
  ['id without the language prefix', (m) => { m.languages.xx.goldens[0].id = 'x'; }, /must start with/],
  ['bad localize', (m) => { m.languages.xx.localize = 'Default Rules'; }, /localize/],
]) {
  test(`validateManifest rejects ${name}`, () => {
    const m = base();
    mutate(m);
    assert.throws(() => validateManifest(m), message);
  });
}
