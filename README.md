# test-action-translation

Golden references and the model-upgrade evaluation for
[QuantEcon/action-translation](https://github.com/QuantEcon/action-translation).

Every time action-translation considers a new Claude model, the same focused evaluation runs
against the same goldens. A golden is a real lecture from a QuantEcon edition, paired with a
translation people have approved. Results are recorded per language, so the repository builds a
history of how each model does in each language.

**Status (2026-10-20):** the goldens are pinned and verified. `model-eval`, the runner, is not
built yet, and no evaluation has run.

## What is here

| Path | What |
|---|---|
| `goldens/manifest.yml` | The golden set: 18 lectures in four languages. Each file is pinned by repository, commit, path, sha256 and size |
| `goldens/README.md` | What each golden is, where it came from, its caveats, and how to add a lecture or a language |
| `bin/fetch-goldens.mjs` | Fetches the pinned files into `.goldens/` (git-ignored) and verifies every byte |
| `history/` | One file per language that records each evaluated model's scores (written by `model-eval --record`) |
| `reports/` | One directory per evaluation, holding the report a model-change decision cites |

| Language | Goldens | Kind | What they can show |
|---|---|---|---|
| ml (Malayalam) | 6 | 1 hand translation, 5 editor-reviewed Sonnet 5 drafts | Quality against an unbiased hand reference, and whether a model already makes the editor's corrections |
| fr (French) | 6 | editor-reviewed Opus 4.8 drafts | Quality against the editor's pages. Neither Sonnet wrote those seeds, so similarity is fair between Sonnet models |
| zh-cn (Chinese) | 3 | edition pages (model output) | Structure and refusals; similarity is tracked for progression only |
| fa (Persian) | 3 | edition pages (mixed provenance) | Structure and refusals; similarity is tracked for progression only |

## Using it

```bash
npm install
npm run check      # validate the manifest (no network)
npm run fetch      # fetch and verify every golden into .goldens/
npm test           # offline tests
```

Behind an HTTPS proxy, Node's `fetch` needs `NODE_USE_ENV_PROXY=1`.

## How a model upgrade is evaluated

The `/model-upgrade` skill in action-translation walks through these steps:

1. **Engine readiness**, an action-translation PR. Add the model's request-policy entry, price and
   tests. The default does not change.
2. **Evaluate**, in this repository. `model-eval --baseline <current default> --candidate <new
   model>` translates every golden a few times with each model, through the engine's own
   `translate init --report-json`.
   - It scores the drafts with deterministic metrics only. There is no LLM judge.
   - It applies per-language rules, writes `reports/<date>-<candidate>-vs-<baseline>/`, and
     appends `history/<lang>.jsonl`.
   - A run costs about $40–50, and `--plan` prints the estimate before anything is spent.
3. **Decide per language.** On PASS, the edition follows the new default. On FAIL or
   INCONCLUSIVE, the edition keeps the old model (`claude-model:` in its workflows) until its
   editor has reviewed drafts from the new one.
4. **The flip**, an action-translation PR. Change the default, cite the report, and release
   through the usual gates.

Billed runs need an `ANTHROPIC_API_KEY`. A maintainer runs them; CI does not.

## Golden kinds, and what each can decide

| Kind | What it is | Similarity to it | Other uses |
|---|---|---|---|
| `hand` | A human translation with no model behind it | Gates: it favours no model | — |
| `post-edited` | An editor's correction of a model's draft (the seed) | Gates only when neither compared model wrote the seed. Where the editor left a sentence alone, the gold keeps the seed model's wording, so similarity favours that model | Whether a draft already makes the editor's corrections, measured where he changed the seed. This gates regardless |
| `edition` | A live edition page, often model output | Reported only, as a progression signal | Structure and refusal rates still count |

## License

MIT. See [LICENSE](LICENSE). The golden texts belong to their source repositories and are
fetched from them rather than copied here.
