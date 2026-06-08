<script lang="ts">
  import type { Snippet } from "svelte";
  import BaseWindow from "./BaseWindow.svelte";

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
    contentLabel = `${title} popup`,
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
      <BaseWindow {id} {title} {contentLabel} modal {closable} {onClose}>
        {#if children}
          {@render children()}
        {/if}
      </BaseWindow>
    </div>
  </div>
{/if}

<style>
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
