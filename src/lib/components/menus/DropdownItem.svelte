<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    children: Snippet;
    action?: Snippet;
    selected?: boolean;
    compact?: boolean;
    create?: boolean;
    disabled?: boolean;
    role?: "menuitem" | "menuitemcheckbox" | "menuitemradio";
    ariaChecked?: boolean;
    title?: string;
    onclick?: (event: MouseEvent) => void;
  };

  let {
    children,
    action,
    selected = false,
    compact = false,
    create = false,
    disabled = false,
    role = "menuitem",
    ariaChecked,
    title,
    onclick,
  }: Props = $props();
</script>

<div
  class="dropdown-item"
  class:selected
  class:compact
  class:create
>
  <button
    class="dropdown-item-target"
    type="button"
    {role}
    aria-checked={role === "menuitem" ? undefined : ariaChecked}
    {disabled}
    {title}
    {onclick}
  >
    {@render children()}
  </button>

  {#if action}
    <div class="dropdown-item-action">
      {@render action()}
    </div>
  {/if}
</div>

<style>
  .dropdown-item {
    display: grid;
    width: 100%;
    min-width: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .dropdown-item-target {
    display: flex;
    width: 100%;
    min-width: 0;
    padding: 7px 9px;
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    align-items: center;
    gap: 8px;
  }

  .dropdown-item:hover,
  .dropdown-item:focus-within,
  .dropdown-item.selected {
    background: hsl(var(--h) var(--sat) var(--l-panel));
  }

  .dropdown-item.selected {
    color: color-mix(in oklab, var(--accent) 82%, var(--text));
  }

  .dropdown-item.create {
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 3%));
    color: var(--muted);
  }

  .dropdown-item.create:hover,
  .dropdown-item.create:focus-within {
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 6%));
    color: var(--text);
  }

  .create .dropdown-item-target {
    min-height: 32px;
  }

  .dropdown-item:focus-within {
    outline: none;
    box-shadow: inset 0 0 0 2px
      color-mix(in oklab, var(--accent) 60%, transparent);
  }

  .dropdown-item-target:focus-visible {
    outline: 0;
  }

  .dropdown-item-target:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .dropdown-item.compact {
    display: inline-grid;
    width: auto;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--muted);
    overflow: hidden;
  }

  .dropdown-item.compact:hover {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
    color: var(--text);
  }

  .dropdown-item.compact.selected {
    border-color: color-mix(in oklab, var(--accent) 50%, var(--border));
    background: color-mix(
      in oklab,
      var(--accent) 15%,
      hsl(var(--h) var(--sat) var(--l-panel))
    );
    color: var(--text);
  }

  .compact .dropdown-item-target {
    width: auto;
    min-height: 22px;
    padding: 3px 8px;
    font-size: 11px;
    gap: 4px;
  }

  .dropdown-item-action {
    display: flex;
    align-items: center;
  }

  .compact .dropdown-item-action {
    width: 20px;
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .compact:hover .dropdown-item-action,
  .compact:focus-within .dropdown-item-action {
    opacity: 1;
  }
</style>
