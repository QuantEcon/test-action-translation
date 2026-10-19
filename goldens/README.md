# Goldens

`manifest.yml` holds the golden set: English lectures paired with translations that people have
approved, each pinned so that every run measures against exactly the same bytes. A golden can
have these files:
- `source`: the English the translation was made from;
- `gold`: the approved translation;
- `seed` (post-edited only): the model draft the editor corrected;
- `editorOnly` (optional): the editor's text before our own normalisation commits, so that sites
  the normalisation introduced can be excluded;
- `origin` (optional): an upstream copy of the gold.

`bin/fetch-goldens.mjs` downloads each file at its pinned commit from `raw.githubusercontent.com`
and checks its sha256 and size. A mismatch is an error.

## Per language

### ml — Malayalam (`localize: none`; exercise-family blocks stay English by edition policy)
- **The hand gold, `getting_started`.** Adisankar Manoj Thanuja wrote this translation by hand,
  with no model behind it, so similarity to it is unbiased. Its English is in production in fa,
  fr and zh-cn. The gold is pinned in action-translation's ml benchmark and is byte-identical to
  the upstream original (`origin`).
- **The five post-edited goldens: `python_by_example`, `functions`, `matplotlib`, `numpy`,
  `pandas`.** These are the editor's corrections of `claude-sonnet-5` seeds, review rounds 1–5,
  lecture-python-programming.ml #1, #7, #13, #23, #26.
  - **The gold is the merge commit**: the editor's correction of exactly that seed. Later edition
    commits apply later rulings and are not golds.
  - **numpy and pandas seeds** were repaired before review: one comma for numpy, 11 disclosed
    repairs for pandas.
  - **Bias:** similarity to these pages favours `claude-sonnet-5`. Rule examples in the ml prompt
    quote the functions and matplotlib pages, so those two are partly in-sample. That affects
    every model equally.
- **Text metrics must skip the exercise-family regions**, which the engine restores to English.

### fr — French (`localize: default`)
- **Rounds 1–2, Emile's reviews** (lecture-python-programming.fr #24, #25, #77, #78, #80):
  `numpy`, `python_by_example`, `functions`, `oop_intro`, `names`.
  - Seed = the merge commit's parent: the `claude-opus-4-8` bulk seed. functions differs in one
    line, which a Sonnet 5 sync re-translated. Gold = the squash merge.
  - These rounds are in-sample: they produced fr glossary v1.1 and v1.2 and four prompt rules.
- **`python_oop` (round 3) is held out**: it is not yet encoded in the engine. The editor
  committed it straight to main, and fr#92 only restored non-breaking spaces.
- **Bias:** neither Sonnet wrote these seeds, so similarity is fair between Sonnet models. It is
  not fair for an Opus model.
- **Normalise U+00A0 before comparing.** Some golds have a plain space before a colon where the
  edition uses a non-breaking space.
- **Excluded candidates:**
  - `about_py`: only 4 changed lines, too little signal.
  - `python_essentials`: 14 of its 32 changed lines translate code comments, under an edition rule
    (fr#88) the engine does not apply yet.
  - Add them when that changes.

### zh-cn — Chinese (`localize: default`)
- **`python_by_example`, `functions`, `numpy`** at the edition's HEAD. These pages are model
  output (`claude-sonnet-4-6` init plus Sonnet 4.6 and Sonnet 5 syncs), with only mechanical
  maintainer edits.
- **They are weak references:** structure and refusal rates count, and similarity is tracked
  only to follow progression.

### fa — Persian (`localize: default`)
- **`python_by_example`, `functions`, `numpy`** at the edition's HEAD, with mixed provenance:
  - functions has a real editor revision (fa#54);
  - python_by_example's base text came from the editor;
  - numpy is model output.
- **They are weak references**, as for zh-cn. The human-touched pages keep hand-reversed
  right-to-left code spans (`()append`) that no model reproduces.

## Adding a post-edited golden (any language)

1. **Find the review.** The editor's PR, or direct commits to main.
2. **Pin the gold**: the merge commit's file, `gold = <merge sha>:<path>`.
3. **Pin the seed**: the merge's first parent, the file the editor edited, `seed = <parent
   sha>:<path>`. Confirm its model in `.translate/state/<lecture>.md.yml` (`model:`) at that
   commit.
4. **Pin the source**: the English at that state file's `source-sha`.
5. **Record sha256 and size**, then run `npm run fetch -- --ids <new id>` and `npm test`.
6. **Write `notes`**: who reviewed it, which PR, any repairs or normalisation, and whether it is
   in-sample (its rulings already shape the engine's glossary or rules) or held out.

## Adding a language

Add a `languages.<code>` entry with `name`, `localize` (the edition's seeding practice:
`none`, `default` or a rule list) and `verbatimDirectives` (true when exercise-family blocks stay
English). Then add at least three goldens. Use edition pages (`kind: edition`) until reviewed
pages exist; they still measure structure and refusals and start the history.
