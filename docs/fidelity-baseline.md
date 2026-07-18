# Rendering fidelity baseline

## Method

On 17 July 2026, `pnpm test:live` fetched three immutable Wikipedia revisions
and parsed a controlled media fixture through English Wikipedia. Requests were
sequential, anonymous, identified, and included `maxlag=5`.

Every response was converted to a standalone Vector 2022 article document using
the target's `headhtml` metadata, parser HTML, `jsconfigvars`, modules, and style
modules. Validation inspected the final HTML structure rather than the source.
Artifacts are reproducible and intentionally not committed.

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
- Pixel-diff comparison and real-target browser interaction baselines remain
  later work. Milestone 1 browser tests verify editor/preview orchestration with
  intercepted services; this live baseline proves target parser/module/media
  structure and runnable output.

## Reproduction

```sh
pnpm install
pnpm test:live
pnpm spike:serve
```

Open `/previews/media-suite`, `/previews/en-wikipedia`,
`/previews/zh-wikipedia`, or `/previews/ar-wikipedia` on the preview server.
