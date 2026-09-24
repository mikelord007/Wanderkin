# Real Livepeer evidence index

This index separates five claims that are easy to conflate:

1. **Catalog availability** means discovery said a capability could be routed.
2. **Historical health** means provider-reported prior calls succeeded; they
   were not necessarily ObjectQuest calls.
3. **Our execution** means ObjectQuest work actually submitted a real paid or
   allowance-consuming job and received a terminal result.
4. **Visual quality** means a human inspected the returned media.
5. **Gameplay usability** means the resulting world was prepared and played;
   a successful provider job alone does not establish this.

## Dated ObjectQuest executions

Costs below are recorded estimates unless explicitly described as metered.
When the provider omitted `cost_paid_usd`, the cost is **unknown**, not zero.

| Date | Application/provider job | Requested / actual capability | Recorded cost | Produced artifact | What it proves |
| --- | --- | --- | ---: | --- | --- |
| 2026-09-18 | `411dc7d9` / `mjob_cfb2286bf2b5` | `rodin-i3d` / `rodin-i3d`; no fallback; served model ID absent from terminal result | Unknown; the retained documentation contains no per-job paid or estimated amount | 5,029,388-byte GLB, SHA-256 `71d05f8c75bec0a46b5225640e94cdf5f2ac252fb49b81d8183f98eefba65c42`; the transient GLB is not committed, but its preparation/save evidence is recorded in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and [`QA.md`](QA.md) | One real photo-to-GLB execution completed. The GLB passed isolated import, three course candidates, candidate switching, save, and reload. It was not evidence that its automatic course was completed in gameplay or that arbitrary objects work. |
| 2026-09-24 | `mjob_7c10fc5aa558` | `kontext-edit` / `kontext-edit`; no fallback observed | $0.042 estimated; disposition `spent`; provider-metered amount absent | [`style-spike-cartoon-reference.jpg`](evidence/style-spike-cartoon-reference.jpg), 256,642 bytes, SHA-256 `42a4eb0b1060ac4a748a267cabc965266e5ea9a78489d4a14065df33618dcc1e` | One real image-edit execution completed in 7.441 s. Human review found good composition/recognizability and teal palette transfer, but weak cartoon/cel-shaded treatment. It is a visual direction, not a playable texture. |
| 2026-09-24 | `mjob_03a06e271b73` | `rodin-i3d` / `rodin-i3d`; no fallback observed | $0.420 estimated; disposition `spent`; provider-metered amount absent | 24,302,428-byte experimental GLB, SHA-256 `b397d4d78fc1709ef0aeca77af9a174b41158e3d092812e4c628b9bbe577167e6`; GLB intentionally not committed. Diagnostic render: [`style-spike-cartoon-mesh.png`](evidence/style-spike-cartoon-mesh.png) | One real styled-reference-to-3D execution completed in 128.411 s. The object remained recognizable and retained palette, but style transfer was weak, geometry was 10× denser than the baseline, and the automatic course stayed ground-biased. It did not establish gameplay usability. |

The two 2026-09-24 jobs spent $0.462 in the ObjectQuest demo ledger against a
$1.50 spike cap. Their terminal records both left `cost_paid_usd` null. The
redacted machine-readable record is
[`style-spike-provenance.json`](evidence/style-spike-provenance.json), and the
decision derived from it is
[`STYLE_PIPELINE_DECISION.md`](STYLE_PIPELINE_DECISION.md).

The 2026-09-18 notes also record an earlier rejected Rodin submission with an
invalid seed. No provider job ID, cost, or artifact for that rejection is
retained, so it cannot be represented as a completed real job; it is preserved
as a failure note rather than silently counted as success.

## Bundled artifact provenance

The repository also contains two earlier real provider outputs used as bundled
samples. Their provenance records contain job IDs but not execution dates or
costs, so they are kept separate from the dated execution ledger above.

| Date | Provider job | Capability | Cost | Repository artifact | Evidence boundary |
| --- | --- | --- | --- | --- | --- |
| Not recorded | `mjob_5c57ebc49690` | `rodin-i3d` | Unknown | [`public/samples/rodin.glb`](../public/samples/rodin.glb) with [`rodin-provenance.json`](../public/samples/rodin-provenance.json) | The authored Rodin sample course was completed and replayed in Chromium. That proves the bundled authored course is playable, not that the provider's automatic course was usable. |
| Not recorded | `mjob_c91e623855ae` | `tripo-mv3d` | Unknown | [`public/samples/tripo.glb`](../public/samples/tripo.glb) with [`tripo-provenance.json`](../public/samples/tripo-provenance.json) | The authored Tripo sample course was completed and replayed in Chromium under the same limitation. |

## Claim matrix

| Capability / claim | Catalog availability (2026-09-24 snapshot) | Provider historical health | ObjectQuest real execution | Visual quality review | Gameplay usability |
| --- | --- | --- | --- | --- | --- |
| `kontext-edit` | Available/active | 255/255 reported successes; `READY` | Yes: `mjob_7c10fc5aa558` | Yes: recognizable, weak cartoon effect | Not applicable; image is reference media only |
| `rodin-i3d` | Available/active | 2/3 reported successes; metadata incomplete | Yes: dated jobs plus bundled provenance | Yes: original and styled mesh renders reviewed | Only bundled authored Rodin course is browser-completed; dated automatic outputs have no completion evidence |
| `tripo-mv3d` | Discovered as an available alternative | No performance ledger retained in the snapshot | Yes: bundled provenance job, date/cost unknown | Bundled mesh is rendered in style captures | Bundled authored Tripo course is browser-completed; no automatic-course claim |
| `bg-remove` | Available/active | 5/5 reported successes; metadata incomplete | **No real ObjectQuest execution** | None | None |
| `gemini-text` | Available/active | 278/281 reported successes; metadata incomplete | **No real ObjectQuest execution** | None | None |
| `music` | Available/active | 171/173 reported successes; metadata incomplete | **No real ObjectQuest execution** | None | No in-game generated music validation |
| `mirelo-sfx` | Available/active | 22/22 reported successes; metadata incomplete | **No real ObjectQuest execution** | None | No in-game generated SFX validation |
| `chatterbox-tts` | Available/active | 60/60 reported successes; `READY` | **No real ObjectQuest execution** | None | No narration/subtitle synchronization validation |
| `pixverse-i2v` | Available/active | 111/119 reported successes; `READY` | **No real ObjectQuest execution** | None | Not gameplay; no postcard output validation |

Catalog and historical-health figures come from the dated read-only discovery
snapshot in [`LIVEPEER_CAPABILITIES.md`](LIVEPEER_CAPABILITIES.md). They may
change and must be refreshed before spending.

## Evidence still missing

There is no real ObjectQuest execution evidence yet for:

- text/quest generation (`gemini-text`),
- music (`music`),
- sound effects or ambience (`mirelo-sfx`),
- narration (`chatterbox-tts`),
- image-to-video postcards (`pixverse-i2v`), or
- background removal (`bg-remove`).

Consequently the repository does not yet support a claim that one real
photo-to-play run generated and used matching quest text, music, effects,
narration, or postcard media. Those remain live-validation checklist items,
not inferred successes from catalog availability or mocked gateway tests.
