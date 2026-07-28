<script lang="ts">
  import {
    activeLayoutPresetId,
    addLayoutPreset,
    applyLayoutPreset,
    layoutPresets,
    leftPaneCollapsed,
    deleteActiveLayoutPreset,
    reorderLayoutPreset,
    toggleLeftPaneCollapsed,
  } from "$lib/utils/workspaceState";
  import type { LayoutPresetDropPosition } from "$lib/utils/layoutPresetOrder";
  import Icon from "$lib/components/utils/Icon.svelte";

  let draggedPresetId = $state<string | null>(null);
  let dropTargetId = $state<string | null>(null);
  let dropPosition = $state<LayoutPresetDropPosition>("before");

  function presetLabel(index: number) {
    return String(index + 1);
  }

  function clearPresetDrag() {
    draggedPresetId = null;
    dropTargetId = null;
    dropPosition = "before";
  }

  function handlePresetDragStart(event: DragEvent, presetId: string) {
    draggedPresetId = presetId;
    event.dataTransfer?.setData("text/plain", presetId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function handlePresetDragOver(event: DragEvent, targetId: string) {
    const movingId =
      draggedPresetId ?? event.dataTransfer?.getData("text/plain") ?? null;
    if (!movingId || movingId === targetId) {
      dropTargetId = null;
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const target = event.currentTarget as HTMLElement;
    const bounds = target.getBoundingClientRect();
    dropTargetId = targetId;
    dropPosition =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  }

  function handlePresetDrop(event: DragEvent, targetId: string) {
    event.preventDefault();
    const movingId =
      draggedPresetId ?? event.dataTransfer?.getData("text/plain") ?? null;
    if (movingId && movingId !== targetId) {
      reorderLayoutPreset(movingId, targetId, dropPosition);
    }
    clearPresetDrag();
  }
</script>

<aside class="side-bar" aria-label="Workspace sidebar">
  <button
    class="tool-button"
    type="button"
    title={$leftPaneCollapsed ? "Expand left column" : "Collapse left column"}
    aria-label={$leftPaneCollapsed
      ? "Expand left column"
      : "Collapse left column"}
    aria-pressed={$leftPaneCollapsed}
    onclick={toggleLeftPaneCollapsed}
  >
    <Icon
      name={$leftPaneCollapsed ? "left_panel_open" : "left_panel_close"}
      size={18}
    />
  </button>

  <div class="preset-list" role="list" aria-label="Layout presets">
    {#each $layoutPresets as preset, index (preset.id)}
      {@const label = presetLabel(index)}
      <button
        class="preset-button"
        class:active={$activeLayoutPresetId === preset.id}
        class:dragging={draggedPresetId === preset.id}
        class:drop-before={dropTargetId === preset.id &&
          dropPosition === "before"}
        class:drop-after={dropTargetId === preset.id &&
          dropPosition === "after"}
        type="button"
        draggable="true"
        title={`Apply layout ${label}. Drag to reorder.`}
        aria-label={`Apply layout ${label}`}
        aria-pressed={$activeLayoutPresetId === preset.id}
        ondragstart={(event) => handlePresetDragStart(event, preset.id)}
        ondragover={(event) => handlePresetDragOver(event, preset.id)}
        ondrop={(event) => handlePresetDrop(event, preset.id)}
        ondragend={clearPresetDrag}
        onclick={() => applyLayoutPreset(preset.id)}
      >
        {label}
      </button>
    {/each}
  </div>

  <div class="bottom-tools">
    <button
      class="tool-button"
      type="button"
      title="Delete current layout"
      aria-label="Delete current layout"
      disabled={$layoutPresets.length <= 1}
      onclick={deleteActiveLayoutPreset}
    >
      <Icon name="remove" size={19} />
    </button>
    <button
      class="tool-button"
      type="button"
      title="Add layout preset"
      aria-label="Add layout preset"
      onclick={addLayoutPreset}
    >
      <Icon name="add" size={19} />
    </button>
  </div>
</aside>

<style>
  .side-bar {
    display: grid;
    width: 40px;
    height: 100%;
    min-height: 0;
    padding: 6px 5px;
    border-right: 1px solid var(--border);
    background: linear-gradient(
      180deg,
      hsl(var(--h) var(--sat) calc(var(--l-panel) + 2%)),
      hsl(var(--h) var(--sat) var(--l-panel))
    );
    flex: 0 0 40px;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 7px;
  }

  .preset-list,
  .bottom-tools {
    display: grid;
    min-width: 0;
    gap: 5px;
  }

  .preset-list {
    align-content: start;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .preset-list::-webkit-scrollbar {
    display: none;
  }

  .tool-button,
  .preset-button {
    display: inline-grid;
    width: 28px;
    height: 28px;
    min-width: 28px;
    min-height: 28px;
    padding: 0;
    border-radius: 8px;
    color: var(--muted);
    place-items: center;
  }

  .preset-button {
    position: relative;
    cursor: grab;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  .preset-button:active {
    cursor: grabbing;
  }

  .preset-button.dragging {
    opacity: 0.45;
  }

  .preset-button.drop-before::before,
  .preset-button.drop-after::after {
    position: absolute;
    right: 2px;
    left: 2px;
    height: 2px;
    border-radius: 999px;
    background: var(--accent);
    content: "";
  }

  .preset-button.drop-before::before {
    top: -4px;
  }

  .preset-button.drop-after::after {
    bottom: -4px;
  }

  .tool-button:hover,
  .preset-button:hover,
  .preset-button.active {
    color: var(--text);
  }

  .preset-button.active {
    border-color: color-mix(in oklab, var(--accent) 62%, var(--border));
    background: color-mix(
      in oklab,
      var(--accent) 18%,
      hsl(var(--h) var(--sat) var(--l-panel))
    );
  }

  .tool-button:active,
  .preset-button:active {
    transform: none;
  }
</style>
