# model-eval — design (not built yet)

Status 2026-10-20: designed, not built. The goldens and `bin/fetch-goldens.mjs` exist. This
document is what the build follows.

The design came out of the 5.5 evaluation work in action-translation:
- PR #395 holds the first, one-off design, which this replaces.
- The critiques of that design are what made this one simple; see Lessons, below.

Keep it lean:
- one command, one scorer, one rules module;
- deterministic gates only, with no LLM judge;
- a standard run costs about $36.

## The command

```
node bin/model-eval.mjs --engine <action-translation checkout> \
     --baseline claude-sonnet-5 --candidate claude-sonnet-5-5 [--also claude-opus-5-5] \
     [--languages ml,fr,zh-cn,fa] [--draws 6] [--root DIR] (--plan | --yes) [--record] \
     [--sweep lecture-python-programming[,…]]
```

- **`--engine`** points at a *built* action-translation checkout whose `translate init` has
  `--report-json`: #395 or later, which also includes the 5.5 request policy from #394. Record its
  git sha, package version, and the SDK version it loads.
- **`--plan`** spends nothing and needs no key. It works from the manifest's byte sizes and prints
  each golden × model with its draws and estimated cost, plus the cost of the optional sweep. The
  cost model is in Cost, below.
- **`--yes`** requires `ANTHROPIC_API_KEY`. It runs these steps:
  1. **Fetch and verify** the goldens (`lib/fetch.mjs`) into `<root>/goldens`.
  2. **Draw.** For each golden × model, run
     `<engine>/tool-test-action-on-github/rate-check.sh --source-dir <root>/goldens/<id>/src
     --fixtures <lecture> --languages <lang> --localize <localize> --model <M> --draws N
     --max-refusals 1000000 --run-dir <root>/runs/<id>/<M>`. Add `--resume` when the run
     directory already exists.
     - Launch the two deciding models of a golden together, so they are drawn in the same window.
     - Run `--also` models only after the deciding pair has finished for every golden.
     - Stop everything at 1.5× the plan, using the reports' `costUSD`.
     - Ctrl-C stops the child runs (exit 130), and a rerun resumes.
     - rate-check exit 1 (a cell FAIL, UNRELIABLE or INCOMPLETE) is a result, not an error.
       Exit 2 stops the whole run.
  3. **Score** every successful draft (`lib/score.py`).
  4. **Apply the rules** (`lib/rules.mjs`).
  5. **Write the report**: `reports/<date>-<candidate>-vs-<baseline>/REPORT.md` and
     `report.json`.
- **`--record`** appends one row per language × model to `history/<lang>.jsonl`, in the format
  `history/README.md` gives.
- **`--sweep`** is optional. Use it for a model generation with new refusal classifiers. It runs
  the candidate × 1 over every lecture of the named source repositories in zh-cn, pinned at their
  `main` sha. A refusal triggers 6 redraws per model on that lecture.
- **`<root>`** defaults to `~/.cache/test-action-translation/<baseline>__<candidate>`. Never put it
  inside the repository.

**Where rate-check puts things.** rate-check already classifies every draw from init's
`--report-json`. Each draw gets these files, so the scorer reads files and never the model:
- `<run>/<lang>/<stem>/<i>/<lecture>`: the draft;
- `<i>.json`: the report, with outcome, failure kind, refusal category, usage and cost;
- `<i>.exit`: the completion marker.

`summary.json` holds the per-cell tally, with Wilson intervals.

## Scoring (`lib/score.py`, python3, stdlib only, run with `python3 -I`)

Every text metric reads **prose**: the text a translator should translate. Build it by stripping
these, all fence-aware:
- the front matter;
- fenced code (``` and ~~~, any info string);
- `$$` and `{math}` blocks;
- directive option lines;
- for languages with `verbatimDirectives: true` (ml), the whole exercise-family regions:
  `{exercise-start}`…`{exercise-end}`, `{solution-start}`…`{solution-end}`, `{exercise}` and
  `{solution}`. The engine restores those to English, so leaving them in makes every draft look
  over-English.

Check the stripper on real drafts before trusting any number from it. The old `align.py` swallowed
gated exercise openers.

**Metrics, per draft:**
- **chrF** (character 6-grams, β = 2), comparing the draft's prose with the gold's prose over the
  whole document. Normalise U+00A0 to a space first; French golds mix the two.
- **Adoption** (post-edited goldens):
  - **Sections.** Split seed, gold and draft into sections on headings outside fences. The parity
    guard means a written draft has the same heading sequence, so sections align by index.
  - **Edit sites.** The word-level `difflib` opcodes between seed prose and gold prose, section by
    section. Drop:
    - whitespace-only edits;
    - edits inside excluded regions;
    - sites our own normalisation introduced (where `editorOnly` and `gold` differ);
    - punctuation-only edits, except where the language treats them as corrections (ml: `-ഉം`
      commas, full stops and colons).
  - **Classifying each site** in the draft's same section, using each fragment with up to 2 tokens
    of its own side's context and shrinking the context when it is not found:
    - **gold-form**: the gold fragment is present and the seed fragment is not;
    - **seed-form**: the reverse;
    - **neither**: otherwise.
  - **adoption = gold-form / all sites.** A deleted paragraph is a miss, never dropped. Report
    seed-form and neither as well. A draft that copies the English scores "neither", so it cannot
    look good.
- **Keep-English** (ml): for each prose paragraph, take Malayalam letters (U+0D00–U+0D7F) over
  Malayalam plus Latin letters, then the mean over paragraphs that have letters. Report the
  draft's value and its absolute difference from the gold's.
- **ml lints**, reported and never gating: run
  `<engine>/experiments/ml-benchmark/scripts/ml_metrics.py --output <draft> --source <en>
  --glossary <engine>/glossary/ml.json --json`. They encode Sonnet 5's error classes.

Output: one JSON object per golden, `{schema: "golden-score/1", sites, drafts: [{path, chrf,
adoption|null, seedForm|null, neither|null, keepEnglishShare|null, keepEnglishDiff|null,
lints|null}]}`.

## Rules (`lib/rules.mjs`, pure, unit-tested)

| Golden kind | Gates on | Reported only |
|---|---|---|
| `hand` | chrF | — |
| `post-edited` | adoption. Also chrF, but only when `seedModel` is neither the baseline nor the candidate (fr: an Opus 4.8 seed, comparing Sonnets) | chrF otherwise, labelled as biased toward the seed's model |
| `edition` | — | chrF, which tracks progression |
| ml, any kind | keep-English difference | lints |

**Each gating metric is a non-inferiority test:**
1. Orient it so that worse is positive.
2. Take the candidate − baseline difference of per-golden means, averaged over goldens.
3. Compute the one-sided 95% upper bound (Welch–Satterthwaite, or a seeded golden-level bootstrap;
   pick one and document it).

The outcome:
- **PASS** when the bound is below the margin.
- **FAIL** when the point estimate is above it.
- **INCONCLUSIVE** otherwise.

**Margin** = 1 × the pooled within-golden SD of the baseline's drafts in the same run. It is
standardized and provisional; recalibrate it from `history/`, and allow a per-language multiplier
in the manifest.

Under this margin a model that is no worse but writes differently can FAIL a similarity metric.
That error is deliberate and cheap: the edition simply stays on the old model until its editor
reviews a draft. A false PASS is the expensive error.

**Structure, over all languages together.** Structural failures are non-infra failures other than
refusals. Take the Mantel–Haenszel risk difference (candidate − baseline) over goldens; its
one-sided 95% upper bound must be below 6.5 points. Use or copy `lib/stats.mjs` from the engine's
`tool-test-action-on-github/lib/` (`mhRiskDifference`, `fisherExact`, `wilson`).

**Refusals.** Every golden is production content.
- Any candidate refusal makes the language INCONCLUSIVE until 6 more draws per model are made on
  that golden.
- The language FAILs if the candidate refuses again, or if Fisher's p < 0.05 against the baseline.

**Missing data never passes.** The language is INCONCLUSIVE in each of these cases:
- a golden × model has fewer than 2 valid drafts;
- infra failures exceed 10% of its attempts;
- a metric could not be scored;
- a follow-up is still owed.

**The verdict per language:**
- **PASS** when every gating rule and the pooled structure rule pass. The edition follows the new
  default.
- **FAIL** or **INCONCLUSIVE**: the edition pins `claude-model: <baseline>` in its workflows (and
  `init -m <baseline>` for drafts) before `v0` moves, and the evidence goes to its editor.

`--also` arms get the same rules, marked INFO; they never decide.

## Tests (offline, no billed calls)

- **`score.py --self-test`**:
  - chrF on known strings;
  - adoption on a synthetic seed, gold and draft with known sites;
  - keep-English arithmetic;
  - the stripper on an archived ml draft with exercise blocks.
- **`lib/rules.mjs`**:
  - equal arms → PASS;
  - 2 margins worse → FAIL;
  - missing arm → INCONCLUSIVE;
  - a refusal → follow-up owed;
  - bias gating: post-edited chrF gates only when neither model wrote the seed.
- **`model-eval --plan`** on the real manifest exits 0 and lists every golden × model.
- **An end-to-end run against a fake Messages API**: 1 golden per language, 2 draws × 2 models,
  through the real `rate-check.sh` and engine CLI.
  - Preload a fetch stub (`node --import`; the SSE shape is in the engine's
    `src/test-support/fake-anthropic-api.ts`).
  - It writes REPORT.md, and `--record` appends history to a temporary copy.

## Cost (list prices; Sonnet 5 / 5.5 $2 in / $10 out per M tokens, Opus 5.5 $4 / $20, cache reads $0.20)

**Assumptions** (from action-translation PR #395's planner):
- **Output tokens per source byte:** fr 0.566 (measured); zh-cn 0.49, fa 0.68 and ml 0.75
  (estimated).
- **Input:** 0.33 tokens per byte, plus 700.
- **Cached prefix:** ml 15.6K tokens, fr 15.3K, fa 12.5K, zh-cn 10.7K.
- **Opus 5.5:** tokenizer ×1.2, plus 2,000 thinking tokens per draft (unmeasured).

**Estimates:**

| Run | Drafts | Estimate |
|---|---|---|
| Standard: 2 Sonnets × 6 draws × 18 goldens | 216 | **$36** (ml 13.4, fr 10.1, fa 7.0, zh-cn 5.2) |
| 4 / 8 / 12 draws | | $24 / $47 / $70 |
| `--also claude-opus-5-5` | +108 | +$47 |
| `--sweep lecture-python-programming` | | ≈ $3 |
| `--sweep` over all 234 production lectures | | ≈ $50 |

In the worst case every draft hits the 64K output cap, about $149; the run stops at 1.5× its
estimate. Record the actual cost per draft in `history/`, so the next estimate is measured.

## Lessons from the critiques (why it is this simple)

The first, one-off design ran to five stages, two LLM judges, rule arbitration and rare-class
guards: about $268, or $389 with Malayalam. The critics found real flaws in it:
- **Point-estimate arbitration** let a model a full margin worse pass.
- **Paragraph alignment dropped deleted content**, which raised the scores of drafts that omitted
  text.
- **A guard counted events where it should have counted drafts.**
- **Missing data had no edition action.**
- **Exercise regions inflated keep-English.**

What survives:
- **Measure the editor's corrections**, never raw similarity to a page whose seed came from one of
  the compared models.
- **Keep the hand translation as the unbiased anchor.**
- **Section windows instead of paragraph alignment.**
- **Missing data never passes.**
- **Draws of the same model are the baseline**, never the original seed.

## Not covered

- **The section-level sync path and the reviewer.** The release gate's end-to-end harness gives
  them one draw per scenario.
- **Forward resync**, until action-translation #348 lands.
- **Native-speaker judgement.** A PASS lets an edition follow the default; its editor's next
  review is still the final word.
- **fa and zh-cn quality.** They have no human references yet; add them to the manifest when they
  exist.
