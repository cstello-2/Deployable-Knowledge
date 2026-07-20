<script lang="ts">
  import Icon from "$lib/components/utils/Icon.svelte";
  import type { Snippet } from "svelte";

  type Props = {
    id: string;
    title: string;
    contentLabel?: string;
    modal?: boolean;
    closable?: boolean;
    collapsible?: boolean;
    height?: number | null;
    collapsed?: boolean;
    controlsDisabled?: boolean;
    onToggleCollapse?: () => void;
    onClose?: () => void;
    headerActions?: Snippet;
    subtitle?: Snippet;
    children?: Snippet;
  };

  let {
    id,
    title,
    contentLabel = `${title} content`,
    modal = false,
    closable = false,
    collapsible = true,
    height = null,
    collapsed = false,
    controlsDisabled = false,
    onToggleCollapse = () => {},
    onClose = () => {},
    headerActions,
    subtitle,
    children,
  }: Props = $props();

  const windowStyle = $derived(
    !collapsed && height && height > 0 ? `flex: 1 1 ${height}px;` : undefined
  );
</script>

<article
  class="miniwin"
  class:modal
  class:collapsed
  data-window-id={id}
  data-window-modal={modal ? "true" : undefined}
  style={windowStyle}
  tabindex="-1"
  aria-label={title}
>
  <header
    class="titlebar"
    data-window-handle={controlsDisabled ? undefined : ""}
  >
    <div class="title-block">
      <div class="title-row">
        <Icon name="drag_indicator" size={16} />
        <div class="title">{title}</div>
        {#if subtitle}
          <div class="subtitle">{@render subtitle()}</div>
        {/if}
      </div>
    </div>
    {#if headerActions || closable || collapsible}
      <div class="actions">
        {#if headerActions}
          {@render headerActions()}
        {/if}
        {#if collapsible}
          <button
            class="icon-btn"
            type="button"
            title={collapsed ? "Expand" : "Collapse"}
            aria-label={collapsed ? "Expand" : "Collapse"}
            aria-pressed={collapsed}
            data-window-action
            disabled={controlsDisabled}
            onclick={() => {
              if (!controlsDisabled) onToggleCollapse();
            }}
          >
            <Icon
              name={collapsed ? "keyboard_arrow_down" : "keyboard_arrow_up"}
            />
          </button>
        {/if}
        {#if closable}
          <button
            class="icon-btn"
            type="button"
            title="Close"
            aria-label="Close"
            data-window-action
            disabled={controlsDisabled}
            onclick={() => {
              if (!controlsDisabled) onClose();
            }}
          >
            <Icon name="close" />
          </button>
        {/if}
      </div>
    {/if}
  </header>

  <div class="content" aria-label={contentLabel} aria-hidden={collapsed}>
    <div class="content-inner">
      {#if children}
        {@render children()}
      {/if}
    </div>
  </div>
</article>

<style>
  .miniwin {
    display: flex;
    min-height: var(--titlebar-height);
    max-height: 100%;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 0;
    background: linear-gradient(180deg, var(--panel), var(--elev));
    box-shadow: var(--shadow);
    outline: none;
    flex: 1 1 0;
    flex-direction: column;
  }

  .miniwin:focus-visible {
    box-shadow:
      0 18px 44px rgba(0, 0, 0, 0.26),
      0 0 0 3px rgba(95, 143, 255, 0.42);
  }

  .titlebar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    height: var(--titlebar-height);
    padding: 0 12px;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(
      180deg,
      hsl(var(--h) var(--sat) calc(var(--l-elev) + 2%)),
      hsl(var(--h) var(--sat) calc(var(--l-panel) + 1%))
    );
    align-items: center;
    cursor: grab;
    flex: 0 0 var(--titlebar-height);
    user-select: none;
  }

  .title-block {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
  }

  .title {
    display: flex;
    min-width: 0;
    align-items: center;
    overflow: hidden;
    flex: 0 1 auto;
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.25px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title-row {
    display: flex;
    width: 100%;
    min-width: 0;
    flex: 1 1 auto;
    align-items: center;
    gap: 7px;
    line-height: 1;
  }

  .title-row :global(.dk-icon) {
    color: var(--muted);
    flex: 0 0 auto;
  }

  .subtitle {
    min-width: 0;
    overflow: hidden;
    margin-left: 2px;
    padding-left: 9px;
    border-left: 1px solid var(--border);
    color: var(--muted);
    flex: 1 1 auto;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .icon-btn {
    display: inline-grid;
    width: 28px;
    height: 28px;
    min-width: 28px;
    min-height: 28px;
    place-items: center;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
  }

  .icon-btn:hover {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
    color: var(--text);
  }

  .content {
    display: grid;
    grid-template-rows: 1fr;
    min-height: 0;
    padding: 14px;
    opacity: 1;
    flex: 1;
  }

  .content-inner {
    overflow: auto;
    min-height: 0;
  }

  .collapsed {
    min-height: var(--titlebar-height);
    flex: 0 0 auto;
  }

  .collapsed .content {
    grid-template-rows: 0fr;
    min-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    opacity: 0;
    flex: 0 0 0;
  }

  :global(.miniwin.dragging) {
    position: fixed;
    z-index: 9999;
    width: var(--drag-w);
    pointer-events: none;
  }

  :global(.miniwin.dragging .titlebar) {
    cursor: grabbing;
  }
</style>
