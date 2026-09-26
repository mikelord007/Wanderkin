# UI direction v2 (user, 2026-09-25 ~21:05 IST) — verbatim

User feedback preceding this brief: "I saw some of the redesign work the redesigned worker has done. I'm not really happy with it. It basically recreated the hero section almost as is, which turned out looking pretty good, but the rest of the page looks so dull."

---

Redesign the remaining Wanderkin UI so it feels like a continuation of the existing landing-page hero, rather than a generic dashboard using the same colors.
Preserve the current typography, dark violet palette, rounded geometry, subtle borders, and purple atmospheric lighting from the hero, but extend its deeper visual principles throughout the product: scale, depth, overlapping layers, oversized environmental forms, cinematic lighting, asymmetry, and the fantasy that ordinary household objects become enormous environments when the player is tiny.
Avoid solving sections primarily with flat purple rectangular cards. Content that represents a generated world should prioritize the world's imagery/render rather than UI chrome.
For the landing page:
- Turn the photograph → generated 3D comparison into a major visual transformation/showcase section rather than two images inside a generic container.
- Redesign the three-step explanation as a connected visual journey: photograph → 3D reconstruction → tiny character exploring, with substantial imagery/illustration and a subtle glowing path connecting the stages.
- Redesign "Worlds to borrow" as immersive game/world-selection cards with large environment imagery, varied composition and strong hover states. Avoid a uniform three-column SaaS-card grid.
- Introduce occasional oversized household objects, tiny characters, checkpoints, shadows, and environmental elements bleeding into or between sections to reinforce the scale fantasy. Keep this restrained: roughly one strong visual motif per section.
- Reuse the glowing arch/portal language from the hero as a recurring visual motif throughout the page.
- Add a visually strong final CTA that returns to the core idea of turning an everyday object into an explorable world.
- Create clear alternation between atmospheric/visual sections and quieter explanatory sections so the entire page is not equally dense.
For the "Your worlds" application screen:
- Keep it more functional than the marketing page, but make world imagery the dominant element of each card.
- Use large 16:9 previews of each generated environment.
- Put metadata and status underneath or overlay them subtly.
- Give Play the dominant action and demote Edit/Export/etc. to secondary actions or an overflow menu.
- Use status differences through restrained border/glow/badge treatments rather than large UI changes.
- Improve hierarchy, spacing and card proportions so the screen feels like a library of miniature worlds rather than a collection of database records.
Do not simply add gradients, glassmorphism, decorative blobs, or more purple everywhere. Every decorative element should support Wanderkin's core fantasy: the familiar world becomes enormous when you're tiny.
Before implementing, audit every existing section/component and decide whether it should be atmospheric, visual, or functional. Then redesign it according to that role while maintaining a coherent system across the app.
