---
name: app
description: Opinionated application components built on top of ../ui primitives
---

- Application components may coordinate business logic and state through stores and services.
- Components never call `fetch` directly; all HTTP and streaming I/O belongs in services or stores.
- Components in `../ui/` are reusable primitives and contain no application business logic.
- Use original HTML spelling for native events and `camelCase` for custom events.
- List props and markup attributes alphabetically.
- Declare component props with an `interface Props` and `let { ... }: Props = $props()`.
- Use JavaScript objects and arrays for dynamic CSS classes and styles.
- When markup can repeat but is too small to extract as a component, use Svelte 5 `{#snippet}` and
  `{@render}`.
- Keep feature components in PascalCase folders, co-locate same-prefixed child components and pure
  logic modules, and expose the public surface through an `index.ts` barrel.
