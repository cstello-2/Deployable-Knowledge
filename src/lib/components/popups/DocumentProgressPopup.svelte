<script lang="ts">
  import Popup from "$lib/components/popups/Popup.svelte";

  type ProgressResponse = {
    percent?: number;
    total?: number;
    current?: number;
    label?: string;
    message?: string;
  };

  type Props = {
    open: boolean;
    title?: string;
    progress?: ProgressResponse | null;
  };

  let { open, title = "Working", progress = null }: Props = $props();

  function formatBytes(bytes: number | undefined) {
    const value = bytes ?? 0;

    if (!Number.isFinite(value) || value <= 0) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = value;
    let index = 0;

    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }

    const decimals = size >= 10 || index === 0 ? 0 : 1;
    return `${size.toFixed(decimals)} ${units[index]}`;
  }

  let percent = $derived(Math.max(0, Math.min(100, progress?.percent ?? 0)));
  let total = $derived(progress?.total ?? 0);
  let current = $derived(progress?.current ?? 0);
  let hasTotal = $derived(total > 0);
  let label = $derived(progress?.label || title);
  let message = $derived(progress?.message || "Please wait.");
</script>

<Popup
  {open}
  id="document-progress"
  title={hasTotal ? `${label}: ${percent.toFixed(1)}%` : label}
  contentLabel="Document progress"
  closeOnBackdrop={false}
  closable={false}
>
  <div class="progress-body" aria-live="polite" aria-busy={open}>
    <div class="progress-wrap" aria-hidden="true">
      <div class="progress-track">
        <div
          class:indeterminate={!hasTotal}
          class="progress-fill"
          style:width={hasTotal ? `${percent}%` : undefined}
        ></div>
      </div>
    </div>
    <div class="progress-message">
      {#if hasTotal}
        {message} - {formatBytes(current)} / {formatBytes(total)}
      {:else}
        {message}
      {/if}
    </div>
  </div>
</Popup>

<style>
  .progress-body {
    display: grid;
    gap: 12px;
    min-width: min(360px, 100%);
  }

  .progress-wrap {
    width: 100%;
  }

  .progress-track {
    width: 100%;
    height: 16px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
  }

  .progress-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
  }

  .progress-fill.indeterminate {
    width: 35%;
    animation: progress-slide 1.1s ease-in-out infinite;
  }

  .progress-message {
    color: var(--muted);
    font-size: 13px;
  }

  @keyframes progress-slide {
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
