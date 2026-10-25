# AGENTS.md

## Git conventions
- Follow Conventional Commits: `type(scope): subject` — e.g. `feat(towers): add slow tower`, `fix(levels): stop wave counter drifting`.
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Scope (optional) is the affected area in kebab-case: `levels`, `towers`, `hud`, `ecs`, `stats`, `main-menu`, …
- Subject in imperative mood, no trailing period; keep it under ~72 chars (the hook enforces a 100-char header limit).
- One commit per logical change; PR titles follow the same format (squash-merge inherits it).
- Enforced locally by the `commit-msg` hook (commitlint) and in CI — never bypass it with `--no-verify`.

## Workflow
- Before planning, skim `README.md` for existing functionality and library links.
- After finishing a task (unless it's a code review):
  - Run a browser smoke test with Playwright — reuse the known flow from `.cursor/smoke-test-handoff.md` before re-exploring.
  - Run unit tests with RTTR: `npm run test:unit`.
- New features (not bugfixes): document them briefly in `README.md`.

## Code style (TypeScript)
- Always write TypeScript; prefer arrow functions (incl. React components) and named exports.
- Prefer `type` declarations over `interface`; separate props into their own type per component.
- No file extensions in imports; group imports (libraries first, relative second, blank line between). No barrel (`index.ts`) files.
- No comments that just restate the code — comment only hacky workarounds.
- Custom event handlers: `on`-prefix naming (e.g. `onSelectTower`).
- Don't read/write `ref.current` during render; prefer atomic store selectors; DRY — reuse existing code over duplicating.
- Remove unused imports after changes.
- Do NOT run build commands or `npx tsc --noEmit` (assume the dev server is running).

## React Three Fiber
- When working on three.js/R3F features, follow `.cursor/rules/react-three-fiber.mdc` (share geometries/materials, avoid unnecessary mounts).

## koota
- When using entity actions (e.g. `enemyActions`), use them through koota's `useActions` hook so the code looks cleaner.
