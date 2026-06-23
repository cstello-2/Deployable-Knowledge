<script module lang="ts">
  import { writable } from "svelte/store";

  type Toast = {
    id: number;
    text: string;
  };

  let nextToastId = 1;
  const toastStore = writable<Toast[]>([]);

  export function showToast(text: string, timeout = 2000) {
    const id = nextToastId++;
    toastStore.update((toasts) => [...toasts, { id, text }]);

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        dismissToast(id);
      }, timeout);
    }

    return id;
  }

  function dismissToast(id: number) {
    toastStore.update((toasts) =>
      toasts.filter((toast) => toast.id !== id),
    );
  }
</script>

{#if $toastStore.length}
  <div class="toast-stack" aria-live="polite" aria-atomic="true">
    {#each $toastStore as toast (toast.id)}
      <button
        class="toast"
        type="button"
        title="Dismiss"
        onclick={() => dismissToast(toast.id)}
      >
        {toast.text}
      </button>
    {/each}
  </div>
{/if}

<style>
  .toast-stack {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 10000;
    display: grid;
    max-width: min(360px, calc(100vw - 36px));
    gap: 8px;
  }

  .toast {
    justify-content: flex-start;
    min-height: 0;
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    box-shadow: var(--shadow);
    color: var(--text);
    cursor: pointer;
    overflow-wrap: anywhere;
    text-align: left;
  }
</style>
