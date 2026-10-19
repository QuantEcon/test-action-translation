# AGENTS.md

Guidance for coding agents in this repository: the golden set and the model-upgrade evaluation
for [QuantEcon/action-translation](https://github.com/QuantEcon/action-translation). Node ≥ 20,
ES modules, one dependency (`yaml`).

Read [README.md](README.md) first, then [DESIGN.md](DESIGN.md), the spec `model-eval` is built
from. The work in flight and its order are in action-translation's handover log,
`.qe/dev/log/2026-10-20-claude-5-5-eval-handover.md`.

## Commands

- `npm install`: setup
- `npm run check`: validate the manifest (no network)
- `npm run fetch`: fetch every golden into `.goldens/` and verify it (`--out DIR` to put them
  elsewhere)
- `npm test`: offline tests (`node --test`)

## Rules

- **Billed calls need `ANTHROPIC_API_KEY` and a maintainer's go-ahead.** Tests never make one:
  they stub `fetch`, or run against a fake Messages API.
- **Gates are deterministic.** No LLM judge decides anything here.
- **Missing data never passes.** A metric that cannot be scored makes the language INCONCLUSIVE.
- **Pins change only with provenance.** A golden is pinned by commit, sha256 and size. Change a
  pin by replacing the entry and recording why in `goldens/README.md`, never by editing a hash
  until it matches.
- **History is append-only.** Never edit a line of `history/*.jsonl`. A correction is a new line
  that says what it corrects.
- **Scratch stays outside the tree.** Run directories and drafts go under
  `~/.cache/test-action-translation/` by default. `.goldens/` and `.eval/` are git-ignored.
- **Python is stdlib only**, run as `python3 -I`.
- **Code changes go through a PR.** Never trust a scripted bulk edit; check its result.
