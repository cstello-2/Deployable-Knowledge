<script lang="ts">
  import type { Snippet } from "svelte";
  import Dropdown from "$lib/components/menus/Dropdown.svelte";
  import DropdownItem from "$lib/components/menus/DropdownItem.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";

  type TriggerContext = {
    open: boolean;
    close: () => void;
    toggle: () => void;
    menuId?: string;
  };

  type Props = {
    id?: string;
    open?: boolean;
    tags: string[];
    selected?: string[];
    title?: string;
    emptyText?: string;
    addLabel?: string;
    align?: "start" | "end";
    closeOnToggle?: boolean;
    trigger: Snippet<[TriggerContext]>;
    onToggle: (tag: string) => void;
    onRemove?: (tag: string) => void;
    onAdd?: () => void;
  };

  let {
    id,
    open = $bindable(false),
    tags,
    selected = [],
    title = "Tags",
    emptyText = "No tags yet.",
    addLabel = "New tag",
    align = "start",
    closeOnToggle = false,
    trigger,
    onToggle,
    onRemove,
    onAdd,
  }: Props = $props();

  function toggleTag(tag: string) {
    onToggle(tag);
    if (closeOnToggle) open = false;
  }

  function addTag() {
    open = false;
    onAdd?.();
  }
</script>

<Dropdown
  {id}
  bind:open
  {align}
  {trigger}
  minWidth="190px"
  maxHeight={260}
  menuClass="tag-dropdown"
>
  <div class="tag-dropdown-title">{title}</div>
  <div class="tag-dropdown-list">
    {#each tags as tag}
      {#snippet removeAction()}
        <button
          class="tag-dropdown-remove"
          type="button"
          title={`Delete #${tag}`}
          aria-label={`Delete #${tag}`}
          onclick={() => onRemove?.(tag)}
        >
          <Icon name="close" size={12} />
        </button>
      {/snippet}
      <DropdownItem
        action={onRemove ? removeAction : undefined}
        compact
        selected={selected.includes(tag)}
        role="menuitemcheckbox"
        ariaChecked={selected.includes(tag)}
        onclick={() => toggleTag(tag)}
      >
        <span class="tag-dropdown-name">#{tag}</span>
      </DropdownItem>
    {:else}
      <div class="tag-dropdown-empty li-subtle">{emptyText}</div>
    {/each}
  </div>

  {#if onAdd}
    <DropdownItem create onclick={addTag}>
      <Icon name="add" size={16} />
      <span>{addLabel}</span>
    </DropdownItem>
  {/if}
</Dropdown>

<style>
  :global(.tag-dropdown) {
    gap: 5px;
  }

  .tag-dropdown-title {
    padding: 2px 8px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .tag-dropdown-list {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .tag-dropdown-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-dropdown-remove {
    display: grid;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    place-items: center;
  }

  .tag-dropdown-remove:hover,
  .tag-dropdown-remove:focus-visible {
    background: color-mix(in oklab, var(--danger, #e06c75) 14%, transparent);
    color: var(--danger, #e06c75);
    outline: none;
  }

  .tag-dropdown-empty {
    padding: 8px;
  }
</style>
