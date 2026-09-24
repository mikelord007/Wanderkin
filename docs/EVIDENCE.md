# Real Livepeer evidence index

Snapshot: **2026-09-24**, application revision `e269fa9`. This index keeps five
different claims separate:

1. **Catalog availability**: discovery said the capability could be routed.
2. **Historical health**: provider history reported prior successes, which may
   have belonged to other callers.
3. **Our execution**: ObjectQuest submitted or reconciled a real provider job.
4. **Visual/audio quality**: a human reviewed the returned media.
5. **Gameplay usability**: the resulting saved world was prepared and played.

A terminal provider success establishes only layer 3. It never proves arbitrary
geometry, media quality, or a completable course.

## Current live-validation batch

The canonical committed runner record is
[`LIVE_VALIDATION_RESULT_2026-09-24.md`](LIVE_VALIDATION_RESULT_2026-09-24.md)
with redacted structured data in
[`live-validation-2026-09-24.json`](evidence/live-validation-2026-09-24.json).
That result preserves both the original stop and the later recovery. The scoped
adapter fix recognizes the observed `run_output.result.text` envelope. One
authorized force-poll reused the same application/provider job and recovered
the quest with zero new submission or ledger delta.

| Row | Capability and job | Result at this snapshot | Artifact / boundary |
| ---: | --- | --- | --- |
| 1 | `bg-remove`, `mjob_a2426904c928` | Ready, no fallback | PNG, 193,234 bytes, SHA-256 `6d0b4d2c18d6dd58aa1a7754cebc710b7872094295457c538666205c0da404f9`; visually inspected in Chrome with recognizable primary objects and somewhat soft fine edges |
| 2 | `kontext-edit`, `mjob_d3d1797a1657` | Ready after zero-spend reconciliation of the same provider job | JPEG, 129,740 bytes, SHA-256 `adcd4f6a9c5ab0e6064d1e3656f906f5f5b9c4a22da704854b7c2c8fa0263c5e`; user visual approval pending |
| 3 | `gpt-image-edit`, `mjob_4a0b2bde417b` | Ready, no fallback | PNG, 684,261 bytes, SHA-256 `93c3895a6dbf68121eb8f50487efd44a0e2601a4ee5bf6c2653c133aa1501106`; user visual approval pending |
| 4 | `rodin-i3d`, `mjob_0001ef7f3201` | Ready, no fallback | GLB, 4,680,412 bytes, SHA-256 `f0855519fb1314e14703ef91a7778b6992f2f4c80b64910cfe4781e719b0e24c`; not yet loaded, prepared, or played by the user |
| 5 | `gemini-text`, `mjob_13e739e8d5af` | **Recovered ready**, served model `fal-ai/any-llm`, no fallback, same app/provider IDs, zero new submission | Validated four-field quest, canonical SHA-256 `47561633496011cc62324b3d7b8225b5600c1f9178e3a5a2e82bfb6fd1f5bb6e`; in-world/user review pending |
| 6 | Music | Failed before provider dispatch; no provider ID and explicitly no charge | Obsolete 60-second request remains retained under `oq-live-20260924-music`; never retry it |
| 7–15 | Ambience, seven SFX cues, narration | Unsubmitted; corrected audio-only resume remains paused | Fresh conservative maximum $0.4124; no media quality claim yet |
| 16 | Postcard | **SKIPPED/BLOCKED** by contract/pricing review | Wrapper cannot pin resolution/audio and the quote is only a lower bound; no enforceable maximum or real video evidence |

No validation level, share ID, or current generated-world gameplay evidence
exists. Rows 1–5 therefore prove real execution and recovery, not a complete
photo-to-play journey. The user owns hands-on appearance, quest, audio, and
gameplay acceptance.

### Spend boundary

- Current batch ledger estimate/reservation: **$0.7247** across rows 1–6,
  including the retained `$0.0315` reservation for row 6 even though the
  provider explicitly rejected it before dispatch and charged nothing.
- Earlier style spike estimates: **$0.462**.
- Combined recorded estimate: **$1.1867**.
- Corrected fresh audio-only maximum for rows 6–15: **$0.4124**. If separately
  authorized, batch ledger plus that plan would be **$1.1371**, and the batch
  plus spike would be **$1.5991**. Postcard is excluded as blocked, not priced
  as a successful or bounded row.
- All current provider-paid cost fields are `null`. Actual paid cost is
  **unknown**, not zero. Estimates are not provider billing.
- The authorized ceiling is $10. Row-5 recovery added no call or estimate.
  Paid recovery is paused; rows 7–15 are unsubmitted and row 16 is blocked.

## Earlier dated ObjectQuest executions

| Date | Application/provider job | Capability | Recorded cost | Artifact and evidence boundary |
| --- | --- | --- | ---: | --- |
| 2026-09-18 | `411dc7d9` / `mjob_cfb2286bf2b5` | `rodin-i3d` | Unknown | 5,029,388-byte GLB, SHA-256 `71d05f8c75bec0a46b5225640e94cdf5f2ac252fb49b81d8183f98eefba65c42`. [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and [`QA.md`](QA.md) record isolated import, three course candidates, switching, save, and reload. They do not prove automatic-course completion or arbitrary-object quality. |
| 2026-09-24 | `mjob_7c10fc5aa558` | `kontext-edit` | $0.042 estimated; metered cost absent | [`style-spike-cartoon-reference.jpg`](evidence/style-spike-cartoon-reference.jpg), 256,642 bytes, SHA-256 `42a4eb0b1060ac4a748a267cabc965266e5ea9a78489d4a14065df33618dcc1e`. Review found recognizability and palette transfer but weak cartoon treatment. |
| 2026-09-24 | `mjob_03a06e271b73` | `rodin-i3d` | $0.420 estimated; metered cost absent | 24,302,428-byte GLB, SHA-256 `b397d4d78fc1709ef0aeca77af9a174b41158e3d092812e4c628b9bbe577167e6`, intentionally not committed. [`style-spike-cartoon-mesh.png`](evidence/style-spike-cartoon-mesh.png) shows recognizable form/palette but weak transfer, about 10× denser geometry, and a ground-biased automatic course. |

The spike's redacted machine-readable provenance is
[`style-spike-provenance.json`](evidence/style-spike-provenance.json); the
resulting product decision is
[`STYLE_PIPELINE_DECISION.md`](STYLE_PIPELINE_DECISION.md). A rejected
2026-09-18 invalid-seed attempt has no retained provider ID, cost, or artifact,
so it is not counted as a completed job.

## Bundled real-provider artifacts

These samples have provider job IDs but no retained execution date or cost:

| Provider job | Capability | Repository artifact | Evidence boundary |
| --- | --- | --- | --- |
| `mjob_5c57ebc49690` | `rodin-i3d` | [`rodin.glb`](../public/samples/rodin.glb), [`rodin-provenance.json`](../public/samples/rodin-provenance.json) | Authored sample course completed/replayed in Chromium; not automatic-course evidence |
| `mjob_c91e623855ae` | `tripo-mv3d` | [`tripo.glb`](../public/samples/tripo.glb), [`tripo-provenance.json`](../public/samples/tripo-provenance.json) | Authored sample course completed/replayed in Chromium; not automatic-course evidence |

## Capability claim matrix

Catalog and historical-health counts are the dated discovery snapshot in
[`LIVEPEER_CAPABILITIES.md`](LIVEPEER_CAPABILITIES.md); they can change.

| Capability | Catalog / historical context | Our real execution | Quality / gameplay boundary |
| --- | --- | --- | --- |
| `bg-remove` | Available; 5/5 reported historical successes | **Yes:** `mjob_a2426904c928` | Cutout inspected; no saved world |
| `kontext-edit` | Available; 255/255; `READY` | **Yes:** current batch and spike jobs | Images exist; current image awaits user approval; not a mesh texture promise |
| `gpt-image-edit` | Available in authorized batch | **Yes:** `mjob_4a0b2bde417b` | Output exists; user review pending |
| `rodin-i3d` | Available; 2/3 in snapshot | **Yes:** current, dated, and bundled jobs | Bundled authored course playable; current GLB gameplay unverified |
| `tripo-mv3d` | Available alternative | Bundled provenance only | Bundled authored course playable; no current automatic-course claim |
| `gemini-text` | Available; 278/281 in snapshot | **Yes:** recovered `mjob_13e739e8d5af` through the same app job | Validated four-field quest; no in-world/user review |
| `music` | Available; 171/173 in snapshot | **No** | Bundled audio works, but it is not generated-music evidence |
| `mirelo-sfx` | Available; 22/22 in snapshot | **No** | No generated ambience/SFX listening evidence |
| `chatterbox-tts` | Available; 60/60; `READY` | **No** | No generated narration/subtitle synchronization evidence |
| `pixverse-i2v` | Available; 111/119; `READY` | **No** | Gameplay capture is a different feature, not postcard evidence |

## Evidence still required

- Preserve terminal evidence for the authorized/in-flight music, ambience, SFX,
  TTS, and postcard jobs, or omit those real-generation claims from the demo.
- Save the current world, load the GLB, inspect/repair its course, complete it,
  publish it, and open the photo-free share in a fresh context.
- Record the user's visual, audio, labeling, and gameplay decisions.
- Keep optional companion work gated until these core items are accepted.
