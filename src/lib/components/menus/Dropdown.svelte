<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Snippet } from "svelte";

  type DropdownAlign = "start" | "end";
  type DropdownPlacement = "auto" | "bottom" | "top";
  type TriggerContext = {
    open: boolean;
    close: () => void;
    toggle: () => void;
    menuId?: string;
  };
  type ViewportRect = {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  type VerticalSpace = {
    above: number;
    below: number;
  };
  type Props = {
    id?: string;
    open?: boolean;
    align?: DropdownAlign;
    placement?: DropdownPlacement;
    width?: string;
    minWidth?: string;
    maxHeight?: number;
    offset?: number;
    viewportMargin?: number;
    role?: string;
    ariaLabel?: string;
    menuClass?: string;
    trigger: Snippet<[TriggerContext]>;
    children: Snippet;
  };

  let {
    id,
    open = $bindable(false),
    align = "start",
    placement = "auto",
    width,
    minWidth,
    maxHeight = 320,
    offset = 6,
    viewportMargin = 8,
    role = "menu",
    ariaLabel,
    menuClass = "",
    trigger,
    children,
  }: Props = $props();

  let rootElement = $state<HTMLElement>(undefined!);
  let menuElement = $state<HTMLElement>(undefined!);
  let positionStyle = $state("visibility: hidden;");
  let animationFrame = 0;
  const menuId = $derived(id ? `${id}_menu` : undefined);
  const sizeStyle = $derived(getSizeStyle());
  const menuStyle = $derived(`${sizeStyle} ${positionStyle}`);
  const panelClass = $derived(
    menuClass ? `dk-dropdown-panel ${menuClass}` : "dk-dropdown-panel",
  );

  onMount(() => {
    function handleDocumentPointerDown(event: PointerEvent) {
      if (!open) return;

      const target = event.target as Node;
      const clickedDropdown =
        rootElement.contains(target) || menuElement.contains(target);

      if (!clickedDropdown) close();
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (open && event.key === "Escape") close();
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleDocumentKeyDown);
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    window.visualViewport?.addEventListener("resize", schedulePosition);
    window.visualViewport?.addEventListener("scroll", schedulePosition);

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);

      document.removeEventListener(
        "pointerdown",
        handleDocumentPointerDown,
        true,
      );
      document.removeEventListener("keydown", handleDocumentKeyDown);
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
      window.visualViewport?.removeEventListener("resize", schedulePosition);
      window.visualViewport?.removeEventListener("scroll", schedulePosition);
    };
  });

  $effect(() => {
    if (!open) return;

    positionStyle = "visibility: hidden;";
    tick().then(schedulePosition);
  });

  function close() {
    open = false;
  }

  function toggle() {
    open = !open;
  }

  function getSizeStyle() {
    const maxWidth = `calc(100vw - ${viewportMargin * 2}px)`;
    const rules = [`max-width: ${maxWidth};`];

    if (width) rules.push(`width: min(${width}, ${maxWidth});`);
    if (minWidth) rules.push(`min-width: min(${minWidth}, ${maxWidth});`);

    rules.push(`max-height: ${maxHeight}px;`);

    return rules.join(" ");
  }

  function schedulePosition() {
    if (!open || animationFrame) return;

    animationFrame = requestAnimationFrame(() => {
      animationFrame = 0;
      if (open) updatePosition();
    });
  }

  function updatePosition() {
    const anchor = rootElement.getBoundingClientRect();
    const panel = menuElement.getBoundingClientRect();
    const viewport = getViewport();
    const spaces = getVerticalSpace(anchor, viewport);
    const openAbove = shouldOpenAbove(spaces, panel.height);
    const availableSpace = openAbove ? spaces.above : spaces.below;
    const panelMaxHeight = getPanelMaxHeight(availableSpace, viewport.height);
    const panelHeight = Math.min(panel.height, panelMaxHeight);
    const top = getPanelTop(anchor, viewport, openAbove, panelHeight);
    const left = getPanelLeft(anchor, viewport, panel.width);

    positionStyle = [
      `top: ${Math.round(top)}px;`,
      `left: ${Math.round(left)}px;`,
      `max-height: ${panelMaxHeight}px;`,
      "visibility: visible;",
    ].join(" ");
  }

  function getViewport(): ViewportRect {
    const viewport = window.visualViewport;

    return {
      left: viewport?.offsetLeft ?? 0,
      top: viewport?.offsetTop ?? 0,
      width: viewport?.width ?? window.innerWidth,
      height: viewport?.height ?? window.innerHeight,
    };
  }

  function getVerticalSpace(
    anchor: DOMRect,
    viewport: ViewportRect,
  ): VerticalSpace {
    return {
      above: anchor.top - viewport.top - offset - viewportMargin,
      below:
        viewport.top + viewport.height - anchor.bottom - offset - viewportMargin,
    };
  }

  function shouldOpenAbove(spaces: VerticalSpace, panelHeight: number) {
    if (placement === "top") return true;
    if (placement === "bottom") return false;

    return spaces.below < panelHeight && spaces.above > spaces.below;
  }

  function getPanelMaxHeight(space: number, viewportHeight: number) {
    const viewportMaxHeight = viewportHeight - viewportMargin * 2;

    return Math.max(
      48,
      Math.min(maxHeight, viewportMaxHeight, Math.floor(space)),
    );
  }

  function getPanelTop(
    anchor: DOMRect,
    viewport: ViewportRect,
    openAbove: boolean,
    panelHeight: number,
  ) {
    const top = openAbove
      ? anchor.top - offset - panelHeight
      : anchor.bottom + offset;
    const minTop = viewport.top + viewportMargin;
    const maxTop = Math.max(
      minTop,
      viewport.top + viewport.height - viewportMargin - panelHeight,
    );

    return clamp(top, minTop, maxTop);
  }

  function getPanelLeft(
    anchor: DOMRect,
    viewport: ViewportRect,
    panelWidth: number,
  ) {
    const left = align === "end" ? anchor.right - panelWidth : anchor.left;
    const minLeft = viewport.left + viewportMargin;
    const maxLeft = Math.max(
      minLeft,
      viewport.left + viewport.width - viewportMargin - panelWidth,
    );

    return clamp(left, minLeft, maxLeft);
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }
</script>

<div class="dk-dropdown" bind:this={rootElement}>
  {@render trigger({ open, close, toggle, menuId })}
</div>

{#if open}
  <div
    id={menuId}
    class={panelClass}
    bind:this={menuElement}
    {role}
    aria-label={ariaLabel}
    style={menuStyle}
  >
    {@render children()}
  </div>
{/if}

<style>
  .dk-dropdown {
    min-width: 0;
  }

  .dk-dropdown-panel {
    position: fixed;
    z-index: 11000;
    display: grid;
    box-sizing: border-box;
    gap: 4px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) - 1%));
    box-shadow: var(--shadow);
    overflow: auto;
  }
</style>
