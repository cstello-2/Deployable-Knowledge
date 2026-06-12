<script lang="ts">
  import Icon from "$lib/components/utils/Icon.svelte";
  import type { Snippet } from "svelte";

  type Props = {
    open: boolean;
    id?: string;
    title: string;
    contentLabel?: string;
    closeOnBackdrop?: boolean;
    closable?: boolean;
    width?: string;
    onClose?: () => void;
    children?: Snippet;
  };

  let {
    open,
    id = "popup",
    title,
    contentLabel = title,
    closeOnBackdrop = true,
    closable = true,
    width = "520px",
    onClose = () => {},
    children,
  }: Props = $props();

  function handleBackdropPointerDown(event: PointerEvent) {
    if (closeOnBackdrop && event.currentTarget === event.target) onClose();
  }
</script>

{#if open}
  <div
    class="popup-wrap"
    role="presentation"
    onpointerdown={handleBackdropPointerDown}
  >
    <div class="popup-stage" role="presentation" style:--popup-width={width}>
      <div
        {id}
        class="popup-container"
        class:closable
        role="dialog"
        aria-modal="true"
        aria-label={contentLabel}
      >
        {#if closable}
          <div class="popup-topbar">
            <button
              class="popup-close"
              type="button"
              title="Close"
              aria-label="Close"
              onclick={onClose}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        {/if}

        {#if children}
          {@render children()}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .popup-container {
    position: relative;
    display: flex;
    min-height: var(--titlebar-height);
    max-height: 100%;
    padding: 10px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: linear-gradient(180deg, var(--panel), var(--elev));
    box-shadow: var(--shadow);
    outline: none;
    flex: 1 1 0;
    flex-direction: column;
    gap: 8px;
  }

  .popup-topbar {
    display: flex;
    justify-content: flex-end;
    flex: 0 0 auto;
  }

  .popup-close {
    display: inline-grid;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--muted);
    cursor: pointer;
    place-items: center;
  }

  .popup-close:hover {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
    color: var(--text);
  }

  .popup-wrap {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: grid;
    padding: 24px;
    background: var(--backdrop);
    backdrop-filter: blur(2px);
    place-items: center;
  }

  .popup-stage {
    width: min(var(--popup-width, 520px), calc(100vw - 32px));
    max-height: min(680px, calc(100vh - 48px));
  }

  .popup-stage :global(.miniwin) {
    margin: 0;
    max-height: min(680px, calc(100vh - 48px));
  }

  .popup-stage :global(.content-inner) {
    overflow: auto;
  }
</style>
