# Repository Agent Guide

These instructions apply to the entire repository. Preserve them when adding or changing code.

## Product Architecture

- This is a SvelteKit application using Svelte 5 runes and strict TypeScript.
- Keep the browser data flow layered: components → runes stores → services → SvelteKit endpoints.
- Application components may coordinate stores and services, but must never call `fetch` directly.
- Services own HTTP and streaming transport. Use the shared API endpoint constants and
  `src/lib/utils/api-fetch.ts` helpers.
- Stores own client state and business behavior. Keep stores idempotent and avoid reactive effects
  that read and write the same state without equality guards.
- Endpoint handlers should validate/orchestrate and delegate persistence to repositories and domain
  logic to server modules.
- Keep database defaults centralized and shared with API/profile defaults rather than duplicating
  magic values.

## Svelte and TypeScript

- Use Svelte 5 syntax (`$state`, `$derived`, `$effect`, snippets, and callback props). Do not add
  legacy Svelte stores or event dispatchers for component communication.
- Declare component props with an `interface Props` and typed `$props()` destructuring. Components
  with no props do not need an empty interface.
- Prefer explicit domain and API types over inline anonymous payload shapes.
- Keep functions small and named around user intent. Return early for invalid or no-op state.
- Avoid single-use helpers that only wrap a primitive type check, property access, coercion, or one
  built-in call. Keep the operation inline when that is clearer; extract a helper only when it
  captures reused logic, non-trivial behavior, or a meaningful domain rule.
- Do not hide malformed external data behind generic fallback helpers. Validate at the boundary and
  either handle the failure explicitly or let it surface to the provider's error handling.
- Make state setters idempotent when they can be reached from actions, effects, resize observers, or
  other reactive callbacks.
- Use PascalCase for Svelte components, camelCase for functions and variables, and existing enum and
  constant conventions for shared string values.

## UI and Visual Language

- Use Tailwind CSS and the primitives in `src/lib/components/ui/`; do not recreate buttons, inputs,
  dialogs, menus, tooltips, scroll areas, cards, or empty states ad hoc.
- Preserve the compact desktop-workbench appearance: tinted theme surfaces, framed controls,
  visible borders, layered window chrome, restrained shadows, and dense spacing.
- Reuse `dk-panel`, `dk-field`, theme tokens, and shared component variants. Add global visual tokens
  in `src/app.css` instead of scattering hard-coded colors.
- Every visual change must work in light, dark, all color themes, and high-contrast mode.
- Avoid component `<style>` blocks. Keep reusable styling in Tailwind classes or sanctioned shared
  styles such as the Markdown stylesheet and `src/app.css`.
- Use Lucide icons. Icon-only controls must have an accessible label and a tooltip; prefer
  `ActionIcon`.
- Do not use native `title` tooltips, nested interactive elements, raw native selects, or custom
  confirmation overlays. Use the shared primitives.
- Preserve keyboard navigation, visible focus treatment, semantic roles, and `aria-*` state.

## Application Structure

- Keep feature components under `src/lib/components/app/<feature>/` with an `index.ts` public barrel.
- The draggable workspace is only the `/` page. Layout presets are browser-style tabs rendered by
  `WorkspaceTabs`; layout tab selection, creation, and deletion do not belong in the sidebar.
- Settings is a full `/settings` page and must not be registered as a draggable workspace window.
- Do not add a persistent application sidebar. The main workspace toolbar places the left-column
  toggle before the layout tabs and Tools, Settings, and User controls at the far right.
- Workspace windows must be declared in `window-registry.ts` and persisted through `workspaceStore`.
- Keep HTTP endpoint paths in `src/lib/constants/api-endpoints.ts` and browser I/O in services.
- Keep reusable application rules aligned with `src/lib/components/app/SKILL.md`.

## Quality and Change Discipline

- Preserve unrelated user changes in the working tree. Do not stage or commit unless the user
  explicitly asks.
- Use `rg`/`rg --files` for repository searches and `apply_patch` for hand edits.
- Format touched files and run all required gates before handing off:

  ```bash
  npm run lint
  npm run check
  npm run build
  git diff --check
  ```

- `npm run check` must finish with zero errors and zero warnings.
- Smoke-test affected routes and interactions when behavior or navigation changes. The workspace
  must continue loading when Ollama is unavailable.
- Remove superseded components, exports, state, and imports completely; do not leave compatibility
  bridges or dead feature logic behind.
