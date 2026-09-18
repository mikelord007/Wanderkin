# ObjectQuest

A browser game that turns photographs of a real room or furniture corner
into a playground for a toy-sized character.

## Getting started

```
npm install
cp .env.example .env
npm run dev
```

This runs the Vite client and the small Node API together. See
`docs/IMPLEMENTATION_PLAN.md` for architecture, contracts, and the task
board.

## Scripts

- `npm run dev` — client + server, single command
- `npm run typecheck` — strict TypeScript, no emit
- `npm run build` — typecheck, client build, server build
- `npm test` — vitest
