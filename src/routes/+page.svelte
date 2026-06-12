<script lang="ts">
  import { onMount } from "svelte";
  import { windowDragLayout } from "$lib/utils/draggable";
  import {
    leftPaneCollapsed,
    leftPaneWidth,
    setLeftPaneWidth,
  } from "$lib/utils/layoutPresets";
  import { columnSplitter } from "$lib/utils/splitter";
  import AppSidebar from "$lib/components/layout/AppSidebar.svelte";
  import {
    closeWindow,
    placeWindowFromDrop,
    setWindowHeights,
    toggleWindowCollapsed,
    visibleWindows,
  } from "$lib/utils/windowState";
  import type { WindowColumn, WindowDefinition } from "$lib/components/windows";

  const MIN_PANE_WINDOW_HEIGHT = 120;
  const COLLAPSED_PANE_WINDOW_HEIGHT = 36;

  let columnsElement: HTMLElement;
  let activePaneResize = $state<string | null>(null);

  type PaneWindow = WindowDefinition & {
    height: number | null;
    collapsed: boolean;
  };

  const columns: { id: WindowColumn; label: string }[] = [
    { id: "left", label: "Left column" },
    { id: "right", label: "Right column" },
  ];

  function windowsFor(column: WindowColumn): PaneWindow[] {
    return $visibleWindows.filter(
      (window) => window.column === column,
    ) as PaneWindow[];
  }

  function paneWindowHeight(window: PaneWindow, columnWindows: PaneWindow[]) {
    return columnWindows.length > 1 ? window.height : null;
  }

  function paneResizeId(column: WindowColumn, index: number) {
    return `${column}:${index}`;
  }

  function paneWindowMinHeight(window: PaneWindow) {
    return window.collapsed
      ? COLLAPSED_PANE_WINDOW_HEIGHT
      : MIN_PANE_WINDOW_HEIGHT;
  }

  function findWindowElement(id: string) {
    return (
      Array.from(
        columnsElement.querySelectorAll<HTMLElement>("[data-window-id]"),
      ).find((element) => element.dataset.windowId === id) ?? null
    );
  }

  function startPaneResize(
    column: WindowColumn,
    index: number,
    event: PointerEvent,
  ) {
    if (!event.isPrimary || event.button !== 0) return;

    const columnWindows = windowsFor(column);
    const before = columnWindows[index];
    const after = columnWindows[index + 1];
    if (!before || !after) return;

    const beforeElement = findWindowElement(before.id);
    const afterElement = findWindowElement(after.id);
    if (!beforeElement || !afterElement) return;

    event.preventDefault();
    event.stopPropagation();

    const beforeStart = beforeElement.getBoundingClientRect().height;
    const afterStart = afterElement.getBoundingClientRect().height;
    const totalHeight = beforeStart + afterStart;
    const minBefore = Math.min(paneWindowMinHeight(before), totalHeight);
    const minAfter = Math.min(paneWindowMinHeight(after), totalHeight);
    const maxBefore = Math.max(minBefore, totalHeight - minAfter);
    const pointerStart = event.clientY;
    const previousCursor = document.documentElement.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    activePaneResize = paneResizeId(column, index);
    document.documentElement.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const onMove = (moveEvent: PointerEvent) => {
      const rawBeforeHeight = beforeStart + moveEvent.clientY - pointerStart;
      const beforeHeight = Math.min(
        maxBefore,
        Math.max(minBefore, rawBeforeHeight),
      );
      const afterHeight = Math.max(minAfter, totalHeight - beforeHeight);
      setWindowHeights([
        { id: before.id, height: beforeHeight },
        { id: after.id, height: afterHeight },
      ]);
    };

    const stopResize = () => {
      activePaneResize = null;
      document.documentElement.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", stopResize);
      document.removeEventListener("pointercancel", stopResize);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", stopResize, { once: true });
    document.addEventListener("pointercancel", stopResize, { once: true });
  }

  function handleWindowDrop(
    event: CustomEvent<{
      windowId: string | null;
      columnId: string | null;
      columnIndex: number;
    }>,
  ) {
    placeWindowFromDrop(event.detail);
  }

  onMount(() => {
    const handler = (event: Event) =>
      handleWindowDrop(
        event as CustomEvent<Parameters<typeof placeWindowFromDrop>[0]>,
      );

    columnsElement.addEventListener("windowdrop", handler);
    return () => columnsElement.removeEventListener("windowdrop", handler);
  });
</script>

<svelte:head>
  <title>Deployable Knowledge</title>
</svelte:head>

<main class="workspace" aria-label="Deployable Knowledge workspace">
  <AppSidebar />
  <section
    class="columns"
    class:leftCollapsed={$leftPaneCollapsed}
    bind:this={columnsElement}
    use:windowDragLayout
    use:columnSplitter={{
      leftCollapsed: $leftPaneCollapsed,
      leftWidth: $leftPaneWidth,
      onLeftWidthChange: setLeftPaneWidth,
    }}
    aria-label="Window columns"
  >
    <div
      id="col-left"
      class="col"
      data-window-column={columns[0].id}
      data-split-pane="left"
      aria-label={columns[0].label}
      aria-hidden={$leftPaneCollapsed}
    >
      {#each windowsFor(columns[0].id) as window, index (window.id)}
        {@const WindowComponent = window.component}
        <WindowComponent
          id={window.id}
          title={window.title}
          closable
          height={paneWindowHeight(window, windowsFor(columns[0].id))}
          collapsed={window.collapsed}
          onToggleCollapse={() => toggleWindowCollapsed(window.id)}
          onClose={() => closeWindow(window.id)}
        />
        {#if index < windowsFor(columns[0].id).length - 1}
          <button
            class="pane-resize"
            class:dragging={activePaneResize ===
              paneResizeId(columns[0].id, index)}
            type="button"
            title="Resize windows"
            aria-label="Resize windows"
            data-window-action
            onpointerdown={(event) =>
              startPaneResize(columns[0].id, index, event)}
          >
            <span aria-hidden="true"></span>
          </button>
        {/if}
      {/each}
    </div>

    <div
      id="splitter"
      class="splitter"
      data-splitter
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize columns"
    ></div>

    <div
      id="col-right"
      class="col"
      data-window-column={columns[1].id}
      data-split-pane="right"
      aria-label={columns[1].label}
    >
      {#each windowsFor(columns[1].id) as window, index (window.id)}
        {@const WindowComponent = window.component}
        <WindowComponent
          id={window.id}
          title={window.title}
          closable
          height={paneWindowHeight(window, windowsFor(columns[1].id))}
          collapsed={window.collapsed}
          onToggleCollapse={() => toggleWindowCollapsed(window.id)}
          onClose={() => closeWindow(window.id)}
        />
        {#if index < windowsFor(columns[1].id).length - 1}
          <button
            class="pane-resize"
            class:dragging={activePaneResize ===
              paneResizeId(columns[1].id, index)}
            type="button"
            title="Resize windows"
            aria-label="Resize windows"
            data-window-action
            onpointerdown={(event) =>
              startPaneResize(columns[1].id, index, event)}
          >
            <span aria-hidden="true"></span>
          </button>
        {/if}
      {/each}
    </div>
  </section>
</main>

<style>
  .workspace {
    display: flex;
    height: 100%;
    min-height: 0;
    background: var(--bg);
  }

  .columns {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .col {
    position: relative;
    display: flex;
    min-height: 0;
    min-width: 220px;
    padding: 0px;
    overflow: hidden;
    border-right: 1px solid var(--border);
    flex: 1 1 50%;
    flex-direction: column;
  }

  .col:last-child {
    border-right: 0;
  }

  .leftCollapsed .col[data-split-pane="left"] {
    min-width: 0;
    border-right: 0;
    pointer-events: none;
    visibility: hidden;
    flex: 0 0 0 !important;
  }

  .leftCollapsed .splitter {
    display: none;
  }

  .pane-resize {
    position: relative;
    display: grid;
    width: 100%;
    height: 10px;
    min-height: 10px;
    min-width: 0;
    padding: 0;
    border: 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    background: linear-gradient(
      180deg,
      hsl(var(--h) var(--sat) calc(var(--l-bg) + 3%)),
      hsl(var(--h) var(--sat) calc(var(--l-bg) + 1%))
    );
    cursor: row-resize;
    flex: 0 0 10px;
    place-items: center;
  }

  .pane-resize span {
    width: 44px;
    height: 3px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
  }

  .pane-resize:hover,
  .pane-resize.dragging {
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
  }

  .pane-resize:hover span,
  .pane-resize.dragging span {
    background: color-mix(in oklab, var(--muted) 60%, transparent);
  }

  .pane-resize:active {
    transform: none;
  }

  .splitter {
    position: relative;
    width: 10px;
    border-right: 1px solid var(--border);
    border-left: 1px solid var(--border);
    background: linear-gradient(
      180deg,
      hsl(var(--h) var(--sat) calc(var(--l-bg) + 3%)),
      hsl(var(--h) var(--sat) calc(var(--l-bg) + 1%))
    );
    cursor: col-resize;
    flex: 0 0 10px;
    transition:
      background 150ms ease,
      box-shadow 150ms ease;
  }

  .splitter::after {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 3px;
    height: 44px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--muted) 60%, transparent);
    content: "";
    opacity: 0;
    transform: translate(-50%, -50%);
    transition:
      opacity 150ms ease,
      background 150ms ease;
  }

  .splitter:hover {
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
  }

  .splitter:hover::after,
  :global(.splitter.dragging)::after {
    opacity: 1;
  }

  :global(.splitter.dragging) {
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 1%));
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 30%, transparent)
      inset;
  }

  :global(.columns.dragging .col) {
    transition:
      background 120ms ease,
      outline-color 120ms ease;
  }

  :global(.columns.dragging .col.drop-candidate) {
    background: color-mix(in oklab, var(--accent) 7%, transparent);
    outline: 2px dashed color-mix(in oklab, var(--accent) 60%, transparent);
    outline-offset: -6px;
  }

  :global(.drop-marker) {
    height: 4px;
    margin: 8px 8px;
    border-radius: 2px;
    background: color-mix(in oklab, var(--accent) 60%, transparent);
  }

  @media (max-width: 720px) {
    .columns {
      flex-direction: column;
    }

    .col {
      min-width: 0;
      min-height: 180px;
    }

    .splitter {
      width: auto;
      height: 10px;
      cursor: row-resize;
      flex-basis: 10px;
    }

    .splitter::after {
      width: 44px;
      height: 3px;
    }
  }
</style>
