# Rendering fidelity baseline

## Method

On 19 July 2026, `pnpm test:live` fetched three immutable Wikipedia revisions
and parsed a controlled media fixture through English Wikipedia. Requests were
sequential, anonymous, identified, included `maxlag=5`, and used a bounded
30-second request timeout. The source-free result is retained in the
[Milestone 3 compatibility report](evidence/milestone-3-compatibility-2026-07-19.json).

Every response was converted to a standalone Vector 2022 article document using
the target's `headhtml` metadata, parser HTML, `jsconfigvars`, modules, and style
modules. Validation inspected the final HTML structure rather than the source.
Rendered HTML and fetched wikitext artifacts are reproducible and intentionally
not committed. The machine-readable report retains only revision metadata,
module names, feature counts, and validation outcomes.

## Pinned revisions

| Fixture                        |   Revision | Timestamp            | Direction | Source characters |
| ------------------------------ | ---------: | -------------------- | --------- | ----------------: |
| English Wikipedia, `Wikipedia` | 1364493197 | 2026-07-16T22:08:17Z | LTR       |           338,790 |
| Chinese Wikipedia, `维基百科`  |   93497071 | 2026-07-16T01:45:27Z | LTR       |           159,625 |
| Arabic Wikipedia, `ويكيبيديا`  |   75059417 | 2026-06-05T18:01:54Z | RTL       |            77,831 |

## Observed compiled features

| Fixture                | Images | Figures | Tables | Math nodes | Reference lists | Audio | Video |
| ---------------------- | -----: | ------: | -----: | ---------: | --------------: | ----: | ----: |
| English pinned article |     45 |      19 |     18 |          0 |               6 |     0 |     3 |
| Chinese pinned article |     57 |      22 |     33 |          0 |               2 |     1 |     2 |
| Arabic pinned article  |     52 |      11 |     10 |          0 |               3 |     1 |     1 |
| Controlled media suite |      4 |       3 |      1 |          2 |               2 |     1 |     1 |

The controlled suite proves image and gallery markup, figure wrappers, sortable
table markup, MathML, Cite output, and TimedMediaHandler audio/video elements.
Parser module results included the corresponding gallery, math, Cite, media, and
TimedMediaHandler modules. Arabic `headhtml` and site metadata both resolved to
RTL.

## Known limits and decisions

- No tested page produced a currently enabled graph/map element. Interactive
  extension support remains capability-based: WikiOne loads parser-declared
  anonymous modules when the target itself supports the construct.
- Pinned articles may contain parser warnings from their templates. Warnings are
  evidence of target parity, not spike failures, unless a fixture expectation
  explicitly disallows them.
- `action=parse` returns anonymous default gadgets and user module names. The
  isolated document filters `user`, `user.options`, and `user.styles`; default
  site gadgets remain isolated to preserve standard published behavior.
- Raw `headhtml` is not trusted or reproduced. This can omit non-content chrome,
  which is outside the MVP fidelity promise.
- Deterministic visual regression uses intercepted first-party services rather
  than unstable live pages. This live baseline separately proves current target
  parser/module/media structure and runnable output.

## Reproduction

```sh
pnpm install
pnpm test:live
pnpm spike:serve
```

Set `WIKIONE_COMPAT_REPORT_PATH` to a repository-relative path when retaining a
new release report. The command builds the exact workspace dependencies before
contacting the APIs, and fails when a fixture is absent or violates its feature
thresholds.

Open `/previews/media-suite`, `/previews/en-wikipedia`,
`/previews/zh-wikipedia`, or `/previews/ar-wikipedia` on the preview server.
