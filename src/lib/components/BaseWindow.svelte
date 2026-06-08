<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    id: string;
    title: string;
    contentLabel?: string;
    modal?: boolean;
    closable?: boolean;
    collapsible?: boolean;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
    onClose?: () => void;
    children?: Snippet;
  };

  let {
    id,
    title,
    contentLabel = `${title} content`,
    modal = false,
    closable = false,
    collapsible = true,
    collapsed = false,
    onToggleCollapse = () => {},
    onClose = () => {},
    children,
  }: Props = $props();
</script>

<article
  class="miniwin"
  class:modal
  class:collapsed
  data-window-id={id}
  data-window-modal={modal ? "true" : undefined}
  tabindex="-1"
  aria-label={title}
>
  <header class="titlebar" data-window-handle>
    <div class="title">{title}</div>
    {#if closable || collapsible}
      <div class="actions">
        {#if collapsible}
          <button
            class="icon-btn"
            type="button"
            title={collapsed ? "Expand" : "Collapse"}
            aria-label={collapsed ? "Expand" : "Collapse"}
            aria-pressed={collapsed}
            data-window-action
            onclick={onToggleCollapse}>{collapsed ? "+" : "-"}</button
          >
        {/if}
        {#if closable}
          <button
            class="icon-btn"
            type="button"
            title="Close"
            aria-label="Close"
            data-window-action
            onclick={onClose}>x</button
          >
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
    min-height: 280px;
    margin: 8px 0 18px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: linear-gradient(180deg, var(--panel), var(--elev));
    box-shadow: var(--shadow);
    outline: none;
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
    user-select: none;
  }

  .title {
    overflow: hidden;
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.25px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .icon-btn {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    padding: 4px 8px;
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
    overflow: hidden;
    min-height: 0;
  }

  .collapsed {
    min-height: 0;
  }

  .collapsed .content {
    grid-template-rows: 0fr;
    padding-top: 0;
    padding-bottom: 0;
    opacity: 0;
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
