<script lang="ts">
  import Popup from "$lib/components/popups/Popup.svelte";

  type Props = {
    open: boolean;
    progress?: number;
    loaded?: number;
    total?: number;
    message?: string;
    error?: string;
    onRetry: () => void;
    onClose: () => void;
  };

  let {
    open,
    progress = 0,
    loaded = 0,
    total = 0,
    message = "Downloading the embedding model.",
    error = "",
    onRetry,
    onClose,
  }: Props = $props();

  function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let index = 0;

    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }

    return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  }

  let hasTotal = $derived(total > 0);
  let boundedProgress = $derived(Math.max(0, Math.min(100, progress)));
</script>

<Popup
  {open}
  id="embedding-model-setup"
  title={error ? "Semantic search setup failed" : "Preparing semantic search"}
  contentLabel="Embedding model setup"
  closeOnBackdrop={false}
  closable={Boolean(error)}
  {onClose}
  width="440px"
>
  <div class="model-setup-body" aria-live="polite" aria-busy={!error}>
    {#if error}
      <p class="model-setup-error">{error}</p>
      <p class="model-setup-detail">
        You can continue without semantic search and retry later.
      </p>
      <div class="li-actions">
        <button class="btn" type="button" onclick={onClose}>Close</button>
        <button class="btn btn-primary" type="button" onclick={onRetry}>
          Retry
        </button>
      </div>
    {:else}
      <p class="model-setup-message">{message}</p>
      <div class="model-progress-track" aria-hidden="true">
        <div
          class="model-progress-fill"
          class:indeterminate={!hasTotal}
          style:width={hasTotal ? `${boundedProgress}%` : undefined}
        ></div>
      </div>
      <div class="model-progress-meta">
        {#if hasTotal}
          <span>{boundedProgress.toFixed(1)}%</span>
          <span>{formatBytes(loaded)} / {formatBytes(total)}</span>
        {:else}
          <span>Starting download…</span>
        {/if}
      </div>
    {/if}
  </div>
</Popup>

<style>
  .model-setup-body {
    display: grid;
    gap: 10px;
  }

  .model-setup-message,
  .model-setup-error,
  .model-setup-detail {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
  }

  .model-setup-message,
  .model-setup-detail,
  .model-progress-meta {
    color: var(--muted);
  }

  .model-setup-error {
    color: var(--text);
  }

  .model-progress-track {
    height: 14px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
  }

  .model-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
  }

  .model-progress-fill.indeterminate {
    width: 35%;
    animation: model-progress-slide 1.1s ease-in-out infinite;
  }

  .model-progress-meta {
    display: flex;
    min-height: 18px;
    font-size: 12px;
    justify-content: space-between;
    gap: 12px;
  }

  @keyframes model-progress-slide {
    0% {
      transform: translateX(-120%);
    }

    50% {
      transform: translateX(95%);
    }

    100% {
      transform: translateX(260%);
    }
  }
</style>
