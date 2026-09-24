# Worker 11 layout evidence — 2026-09-24

`layout-accessibility.qa.test.ts` passed 4/4 in 19.1 seconds against a real,
isolated local API.

At `1280×800` and `375×812`, the welcome, My worlds, capture, and friend
landing screens had no horizontal document overflow. Their primary actions
remained visible, and the automated visible-control audit found no unnamed
interactive control. A touch-enabled 375×812 context showed the explicit
“Keyboard and mouse are supported. Touch controls are not available yet.”
notice and a usable Play action rather than implying broken touch gameplay.

Evidence:

- [Desktop welcome](artifacts/layout-accessibility/qa-layout-accessibility.qa-ed53f--and-My-worlds-fit-1280x800/welcome-1280.png)
- [Desktop capture](artifacts/layout-accessibility/qa-layout-accessibility.qa-ed53f--and-My-worlds-fit-1280x800/capture-1280.png)
- [Mobile welcome](artifacts/layout-accessibility/qa-layout-accessibility.qa-31d32-e-and-My-worlds-fit-375x812/welcome-375.png)
- [Mobile capture](artifacts/layout-accessibility/qa-layout-accessibility.qa-31d32-e-and-My-worlds-fit-375x812/capture-375.png)
- [Desktop friend landing](artifacts/layout-accessibility/qa-layout-accessibility.qa-1e9dd--and-exposes-named-controls/friend-1280.png)
- [Mobile friend landing](artifacts/layout-accessibility/qa-layout-accessibility.qa-1e9dd--and-exposes-named-controls/friend-375.png)
- [Mobile supported-controls notice](artifacts/layout-accessibility/qa-layout-accessibility.qa-fca10-s-supported-controls-notice/mobile-touch-controls-notice.png)

The shared-course page used a publication created through the actual local
server and opened by its share ID. No paid-provider call was made.

Completion layout at desktop is separately captured in
`worker11-gameplay-visuals-2026-09-24.md`. A dedicated mobile completion
capture was not completed in this pass and is retained as a limitation.
