# History

One file per language, `<lang>.jsonl`. Each line is one model's result in one evaluation, as
`model-eval --record` writes it. Together the lines show how each model has done in each language
over time.

Planned fields:
- **What ran:** `date`, `engineVersion`, `engineSha`, `sdkVersion`, `model`.
- **Its role:** `role` (`baseline`, `candidate` or `also`).
- **Outcomes:** `draws`, `ok`, `structuralFailures`, `refusals`.
- **Scores:** `metrics` (`{ name: { mean, sd, n } }`).
- **The verdict:** `verdictVsBaseline`.
- **Where it came from:** `report`, the path under `reports/`.

Lines are appended, never edited. A correction is a new line that says what it corrects.
