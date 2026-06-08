<script lang="ts">
  type Props = {
    tags: string[];
    selected?: string[];
    title?: string;
    emptyText?: string;
    addLabel?: string;
    onToggle: (tag: string) => void;
    onRemove?: (tag: string) => void;
    onAdd?: () => void;
  };

  let {
    tags,
    selected = [],
    title = "Tags",
    emptyText = "No tags yet.",
    addLabel = "Add Tag",
    onToggle,
    onRemove,
    onAdd,
  }: Props = $props();
</script>

<div class="tag-menu" role="menu" tabindex="-1">
  <div class="tag-menu-title">{title}</div>
  <div class="tag-menu-list">
    {#each tags as tag}
      <button
        class:selected={selected.includes(tag)}
        class="tag-chip"
        type="button"
        onclick={() => onToggle(tag)}
      >
        <span>#{tag}</span>
        {#if onRemove}
          <span
            class="tag-chip-x"
            aria-hidden="true"
            onclick={(event) => {
              event.stopPropagation();
              onRemove(tag);
            }}>x</span
          >
        {/if}
      </button>
    {:else}
      <div class="li-subtle menu-empty">{emptyText}</div>
    {/each}
  </div>
  {#if onAdd}
    <button class="btn btn-sm" type="button" onclick={onAdd}>{addLabel}</button>
  {/if}
</div>
