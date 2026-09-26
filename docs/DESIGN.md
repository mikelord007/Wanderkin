# Pocket Wonder — ObjectQuest v2

## Concept and visual grammar

Everyday objects become extraordinary little worlds. Pocket Wonder feels like a field notebook from a tiny expedition: warm paper, oversized editorial headlines, crisp ink, framed photographs, numbered steps, and small saturated discoveries. The object is always the hero. Decoration must never imply a generated result or a playable feature that does not exist.

Use a quiet cream canvas, white cards, dark plum ink, and one world accent at a time. No glass panels, rainbow gradients, fake screenshots, or endless floating animation. The existing bundled desk-and-sofa photograph and its actual 3D asset are the welcome example; call it a bundled sample, not a newly generated object world.

## Tokens and typography

Implementation lives in `src/ui/theme`. Import `theme/index.css` once after legacy styles. Wrap new screens in `oq-theme`; use `data-world-style="cartoon"`, `"hand-painted"`, or `"watercolor"` on that wrapper or any nested subtree. `WorldStyleScope` provides the same mechanism in React. Set the attribute from persisted style; selecting an accent never submits a job. Missing style uses Cartoon. Components use `oq-kit-*` classes so the legacy screens can be migrated independently.

- Body/UI: system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif. Headings: Georgia, Cambria, Times New Roman, serif. Fonts require no download or third-party request.
- Body 16px/1.55; small 14px/1.5; labels 14px/1.4, weight 650. No essential text under 14px. Display heading clamp(36px, 5vw, 68px), line-height 1.04, -0.045em. Screen heading clamp(30px, 4vw, 44px). Component heading 22px. Numerals use tabular spacing for timers and progress.
- Paper `#f7f4ec`; surface `#fffdf8`; inset `#eeeae2`; ink `#282536`; muted ink `#625d6b`; strong border `#89818d`; decorative border `#d9d3cc`.
- Cartoon: action `#6543b5`, action-hover `#50328f`, wash `#eee6ff`, accent ink `#4c2f85`. Rounded purple markers echo clear silhouettes and bold colors.
- Hand-painted: action `#a3442f`, action-hover `#833322`, wash `#f8e5d9`, accent ink `#843622`. Clay and peach echo brushwork and warm light.
- Watercolor: action `#246b70`, action-hover `#195459`, wash `#dcefed`, accent ink `#19565b`. Teal and pale sea glass echo translucent washes without lowering text contrast.
- Success `#286544`, error `#a12e39`, warning `#795011`; pair each with text/icon, never color alone. Action text is white. World-style accents are UI echoes only; the renderer owns actual materials and lighting.
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64px. Card padding 24px desktop / 20px phone. Radii: 8px inputs; 16px tiles; 24px panels; 999px chips. Light resting shadow, stronger shadow only for elevated sheets.

## Interaction, motion, accessibility

Minimum interactive target 44 × 44px. All buttons are native buttons, choices native radio inputs in a labeled fieldset, fields have persistent labels and linked hints/errors. A selected tile has a check marker and thicker border. Icon-only actions require accessible names. Icons are small local inline SVGs with round 1.8px strokes; decorative icons are hidden from assistive technology. Never rely on emoji glyphs for essential meaning.

WCAG AA: normal text at least 4.5:1, large text 3:1, controls/focus indicators 3:1. Use strong borders on controls; decorative separators may be lighter. Focus uses a 3px accent-ink outline plus 3px paper separation. HUD/subtitles have opaque ink backgrounds and white text regardless of scene brightness. Errors are adjacent to fields and announced. Progress changes use polite announcements; blocking errors use alerts. Do not announce a timer every frame.

Transitions last 140–220ms, ease-out, limited to color/opacity or a 2px button movement. No auto-rotating hero. Reduced motion removes transforms, looping animation, smooth scrolling, animated reveals and decorative movement; progress retains a static indicator plus readable status. No audio autoplay. Motion preferences also apply to game camera/celebrations in their owning modules.

Modal/Sheet uses native modal dialog: focus moves inside, Tab stays inside, Escape and a visible Close button dismiss, background is inert, focus returns to the trigger. Destructive decisions focus the safe action. Toasts remain until dismissed; essential failures also remain inline. Audio controls expose master/music/effects/voice percentages and mute; caller owns playback and persistence. Subtitles remain readable without audio.

## Responsive composition

Desktop: max content width 1184px, 32px gutters; creation content max 880px. Welcome uses a two-column text/example composition; wide task screens use a preview plus 360px action panel. Phone (below 700px): 20px gutters, one column, heading then preview then actions; two adjacent photo frames may remain side by side if each is at least 140px. Form choices stack; long labels wrap. Primary actions may fill width. Never hide essential actions behind hover. A bottom sheet has max-height 88dvh, independent scrolling, safe-area padding. PlayFrame uses 100dvh, safe-area insets, top HUD and bottom subtitle/control lanes. Do not place subtitles over touch controls. At 200% zoom the layout reflows; no horizontal document scrolling at 375px. Mobile landing and creation work even if game touch controls are unavailable: state supported controls before entry.

## Copy

Friendly, specific, quietly curious. Short sentence-case action verbs. Say photo, object, world, course, and sound; never model/provider/capability/mesh/job IDs in ordinary player copy. Technical diagnostics belong in a separate support surface. Use “Preparing” when checking is incomplete, and “Needs adjustment” when repair is required. Never promise a completion time without evidence. Retry text identifies what is being retried and preserves successful work. Do not use “verified” without supporting checks.

## Screen specifications

### 1 — Welcome

Header: ObjectQuest wordmark left, My worlds right. Eyebrow “A little adventure, made from your world.” Headline exactly “Your everyday objects. Extraordinary little worlds.” Lead explains photograph → choose a look → step inside. Primary Create my world; secondary Play a sample (opens default bundled sample immediately); My worlds scrolls/focuses the saved-world section. Hero pairs the real source photograph with the actual asset preview, labeled Original photo / Playable sample. A small “Bundled example · ready to explore” caption avoids claiming live generation. Below: sample cards, saved worlds, and a collapsed import section. Sample cards use player-facing names (Desk & sofa / A different perspective), never provider names. Loading: reserved card space and status text. Empty library: “Your first world starts with a photo” plus Create my world. Library errors stay in the library; samples remain available. A preview failure keeps the source image and sample action available. Existing Play/Edit/Export/Import callbacks remain intact.

### 2 — Capture or upload

Stepper Photo → Look → Preview → World. Heading “What will your world be made of?” One large upload Card with photo/camera icon and three concise tips: whole object, good light, simple background. Desktop upload/drop zone; phone Take a photo / Choose from photos. After selection show correctly oriented image on paper, then primary Use this photo, secondary Retake or replace, tertiary Back. Additional angles are optional and visibly secondary. Empty state is the upload card. Loading keeps selected image with “Uploading your photo”. Invalid format/size errors are inline before paid work; denied camera says “Camera unavailable. Choose a photo instead.” Preserve upload action and selection on recoverable errors.

### 3 — Review object

Heading “Here’s your object.” Large cutout on checker-free neutral wash; adjacent Original toggle and brief “Is the whole object here?” checklist. Primary Looks good; secondary Adjust crop / Replace photo; Use original photo if supported. Crop controls need keyboard handles or numeric alternatives. Loading reserves preview aspect ratio and names the isolation step. Broken/empty cutout: show original and “Some of your object is missing”; block silent continuation, offer original/replace. Retry only isolation. Back preserves photo.

### 4 — Customize

Heading “What kind of adventure is this?” Three labeled fieldsets/sections: Look (three image-slot ChoiceTiles); Adventure (Explore, Collect, Race); optional Atmosphere TextField. Collect is default; Cartoon is initial default unless returning to a saved selection. Look examples are explicitly labeled style examples until an actual-object preview exists. Descriptions: “Wander at your own pace”, “Find the lost colors and unlock the portal”, “Reach the finish as fast as you can”. Atmosphere hint “A floating island above the clouds…” with character counter when bounded. Primary Preview my world; secondary Back. Local changes never spend. Disable submit during its own request only. Preview error preserves all choices, identifies failure, and offers explicit Retry preview. Empty optional atmosphere is valid.

### 5 — Approve preview

Heading “Like this direction?” Original and selected preview side by side (phone stacked or accessible labeled toggle). Style badge plus atmosphere summary. Explain “This is the visual direction. Your playable world may look a little different.” Primary Build my world; secondary Change look / Try another preview; Back preserves approved reference. Loading keeps original visible and status “Finding your world’s look”. No successful preview: primary unavailable with reason. Retry is deliberate; cached selection does not regenerate. Failed preview preserves last success and clearly marks which version will be built. Build locks exact approved reference and settings; do not swap underneath it.

### 6 — Generation

Heading “Your world is taking shape.” Chosen preview left; ProgressPanel right with Preparing your object / Building its 3D shape / Creating your course / Adding its story and sound. Stage status comes from real data: pending, active, complete, error. Use spinner or static reduced-motion marker, never invented percentage. Show elapsed time only when known. Reveal actual title/quest/3D result as ready. Audio preview requires Play action. Primary Enter world as soon as core course is ready; secondary My worlds always available. Explain leaving does not cancel work. Initial reconnect state “Finding your world’s progress”; refresh observes same operation. Core error identifies stage with Retry that stage / Edit choices. Optional audio error says “Your world is ready. Sound can be added later.” Successful outputs stay visible and playable.

### 7 — Ready / repair

Heading “Welcome to {world title}.” Actual rendered world takes two-thirds of desktop; mission Card contains one short objective, mode, and supported control hints. Primary Enter world; secondary Adjust course / World settings. Settings opens Sheet for look summary/audio/subtitles; no hidden regeneration. Loading says “Preparing your course” and preserves preview. If adjustment needed, replace primary with Adjust course and show a specific actionable reason (“Move this checkpoint closer to the previous platform”). Guided editor opens with relevant marker selected, instructions and Save / Back. Do not send healthy courses through editor. Missing assets offer Retry loading / My worlds, never a blank canvas. Preparation, checked, and needs-adjustment badges remain distinct.

### 8 — Play

PlayFrame full screen. Top-left HUDChip “Colors found 0/3”; beneath a short objective. Top-right Pause and Sound buttons. Bottom-center SubtitleBar; contextual control hint sits above reserved touch-control region. Desktop intro uses actual supported bindings, disappears on acknowledgement, does not repeat on respawn. Collect feedback pairs count/text with color restoration and optional sound; portal objective changes only after required count. Explore has no mandatory timer; Race shows tabular timer/checkpoints/countdown, restart confirmation only when progress would be lost. Pause Sheet: Resume (primary), Restart, Sound, Exit world. Loading and fatal runtime errors replace canvas with visible named state and exit/retry. Controls unavailable on touch: state keyboard requirement before entering; never fake a joystick. Subtitles and mute persist. Keep color fragments distinguishable by shape/label.

### 9 — Completion

Heading Collect: “You brought the colors back.” Race: “A little world. A great run.” Explore: “There’s always more to discover.” Restored world image above result Card; show only relevant earned data, with personal/unverified time label where appropriate. Primary Share this world (playable link); secondary Play again / Try Race / Create another world. Save status is explicit and retryable. Race mode changes requiring course modification disclose it and preserve original. Share Sheet distinguishes private save from published version, copy success Toast, stable link. Separate optional “Animated postcard” and “Gameplay highlight” cards; each has its own pending/error/retry state. Generated animation never says gameplay. Replay and link sharing remain enabled while media runs. Empty recording says “No gameplay recording for this run”; missing media does not erase completion.

### 10 — Shared world

Compact ObjectQuest header; centered actual preview, title, mode badge, short mission, and optional creator challenge. Primary Play; secondary Create my own world. Race target is labeled personal/unverified and binds immutable published course version. No upload or regeneration step, no source photographs unless creator explicitly shared them. Loading “Opening this world”; missing/expired/unpublished link explains unavailability and offers Play a sample / Back to ObjectQuest. Unsupported device controls disclosed before Play. Audio begins only after deliberate entry. Privacy: no source-photo comparison affordance by default.

### My worlds (persistent destination)

Heading “My worlds”; filter tabs All / Ready / In progress / Needs attention with counts only when known. Responsive Card grid. Each card: available preview, title or “Untitled world”, style/mode, text status, next action. Draft → Resume; pending → View progress; playable → Play, secondary Edit; failed → Retry relevant stage. Private/published distinction explicit. Empty: Create my world and Play a sample. Loading uses stable slots; failure offers Reload worlds without losing local drafts. Expired assets get a specific repair explanation. Do not infer that local navigation cancels a generation.

## Integration and QA

Kit exports live in `src/ui/components/index.ts`. Keep business logic, paid requests, audio playback, persistence, and game events in owning screens/modules. Kit components are controlled and callback-driven. WorldStyleScope can nest for a three-style QA gallery. Preview entry `/design-kit/` is a standalone Vite development page, intentionally outside the production navigation. Test all three styles, native radio arrow navigation, visible focus, modal Tab/Escape/focus restoration, sliders, 375px layout, 200% zoom, reduced motion, loading/disabled/error states, and offline preview fallback. Use real sample assets; no runtime external font/icon services.

### Component integration reference

```tsx
import { WorldStyleScope, Button, ChoiceTiles, TextField,
  ProgressPanel, Sheet, AudioControls, PlayFrame, HUDChip,
  SubtitleBar } from "../components/index.js";

// Wrap each migrated screen; kit CSS imports its own scoped theme.
<WorldStyleScope worldStyle={selectedStyle}>
  <ChoiceTiles legend="Adventure" value={mode} options={options}
    onChange={setMode} />
  <TextField label="Atmosphere (optional)" value={atmosphere}
    onChange={event => setAtmosphere(event.target.value)}
    helperText="A few words are enough." />
  <Button loading={submitting} loadingLabel="Creating your preview…"
    onClick={submitPreview}>Preview my world</Button>
</WorldStyleScope>
```

- `ChoiceOption`: value, label, description, optional image ReactNode and disabled. Images supplied by the screen; use meaningful alt for actual references, empty alt for redundant decoration. LookChoiceTiles / AdventureChoiceTiles aliases use the same generic API. Keep three choices in each labeled fieldset.
- `ProgressStage`: id, label, status (`pending | active | complete | error`), optional detail. `ProgressPanel` takes title, detail, stages, optional percent only with a known total, and action slot. `Stepper` can stand alone. Derive statuses from the shared job contract in the screen adapter.
- `AudioSettings`: master/music/effects/voice percentages 0–100 plus muted boolean. `AudioControls` takes value/onChange. Convert percentages in the owning audio engine; mute retains slider values. DEFAULT_AUDIO_SETTINGS is an initial suggestion, not persisted state.
- `Modal` / `Sheet`: controlled open/onClose, title, children. Native dialog plus explicit boundary wrapping contains keyboard focus and restores the opener. Put error explanations inside the dialog; don't dismiss on failed saves.
- `Toast`: message, onDismiss, optional tone success/error/info. Keep it in a mounted live region when possible; no automatic expiry. `HUDChip`: children, optional label and announce; use announce for infrequent collected-count changes, not continuously ticking timers.
- `PlayFrame`: scene, hud, actions, subtitles and controls slots; viewport-filling by default, embedded only for previews. Apply world scope outside the frame. `SubtitleBar`: text, optional speaker and visible. Canvas/controls remain the game worker's responsibility.
- `CornerTurntable` is a welcome-only turntable of the actual bundled desk-and-sofa reconstruction (a lighter copy, `public/landing/corner.glb`). It turns slowly, can be dragged or turned with the arrow keys, eases back to the front after 3 s idle, and never spins under reduced motion. The chunk and model load only when the card nears the viewport (`useInView`), and it stops rendering offscreen or in a background tab. It is not a second game runtime. The still render stays in place until it is ready and if WebGL is unavailable, so it never blocks Create or the sample buttons.

### Verification evidence (2026-09-24)

With Vite running on port 5191, run `node src/ui/theme/verify-design-kit.mjs`. Set OQ_DESIGN_URL to use another local origin. Chrome is required. Screenshots land in ignored `test-results/design/`: kit-cartoon.png, kit-hand-painted.png, kit-watercolor.png, kit-mobile.png. No screenshot or generated build artifact is committed.

The kit check covers native radio arrow keys, slider/mute interaction, modal/sheet focus containment, Escape and focus restoration in all three styles; visible focus; 375px overflow; reduced-motion spinner behavior; no page errors; calculated text contrast. Tested ratios: ink/paper 13.57:1, muted/paper 5.79:1, white/action 6.95:1 Cartoon, 6.13:1 Hand-painted, 6.15:1 Watercolor. Accent ink/wash ranges 6.79–8.48:1.

The welcome check loads the actual GLB, reaches gameplay entry through both sample cards, checks Create/Back navigation, My worlds focus, import controls, full-height paper background at 375px, and independent library/preview failure fallbacks. Library API responses are stubbed empty/unavailable; this is not persistence or live-provider acceptance. Screenshots show the empty-library fixture. Both sample assets and their game loading paths are real. Legacy in-game titles and screens 2–10 remain owned by their implementation workers.

The standalone preview uses `design-kit/index.html`, served by Vite at `/design-kit/`. It is deliberately dev-only: production inclusion would need an additional Rollup HTML input owned by the integration worker. No changes to App, main, root index.html, Vite config, runtime, server, shared contracts, package manifests, or dependencies are needed for this kit. The original boot screen and non-migrated screens retain their baseline theme until their owners adopt it.
