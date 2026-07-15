<script lang="ts">
  import Popup from "$lib/components/popups/Popup.svelte";

  type Progress = {
    percent?: number;
    label?: string;
    message?: string;
  };

  type Props = {
    open: boolean;
    id?: string;
    title?: string;
    contentLabel?: string;
    progress?: Progress | null;
    error?: string;
    errorTitle?: string;
    errorDetail?: string;
    onRetry?: () => void;
    onClose?: () => void;
  };

  let {
    open,
    id = "progress-popup",
    title = "Working",
    contentLabel = "Progress",
    progress = null,
    error = "",
    errorTitle = `${title} failed`,
    errorDetail = "",
    onRetry,
    onClose = () => {},
  }: Props = $props();

  let percent = $derived(Math.max(0, Math.min(100, progress?.percent ?? 0)));
  let hasPercent = $derived(Number.isFinite(progress?.percent));
  let label = $derived(progress?.label || title);
  let message = $derived(progress?.message || "Please wait.");
</script>

<Popup
  {open}
  {id}
  title={error ? errorTitle : label}
  {contentLabel}
  closeOnBackdrop={false}
  closable={Boolean(error)}
  {onClose}
  width="440px"
>
  <div class="progress-body" aria-live="polite" aria-busy={open && !error}>
    {#if error}
      <p class="progress-error">{error}</p>
      {#if errorDetail}
        <p class="progress-detail">{errorDetail}</p>
      {/if}
      <div class="li-actions">
        <button class="btn" type="button" onclick={onClose}>Close</button>
        {#if onRetry}
          <button class="btn btn-primary" type="button" onclick={onRetry}>Retry</button>
        {/if}
      </div>
    {:else}
      <div class="progress-wrap">
        <div
          class="progress-track"
          role="progressbar"
          aria-label={label}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={hasPercent ? Math.round(percent) : undefined}
        >
          <div
            class="progress-fill"
            class:indeterminate={!hasPercent}
            style:width={hasPercent ? `${percent}%` : undefined}
          ></div>
        </div>
        <strong class="progress-percent">
          {hasPercent ? `${Math.round(percent)}%` : "…"}
        </strong>
      </div>
      <div class="progress-message">{message}</div>
    {/if}
  </div>
</Popup>

<style>
  .progress-body {
    display: grid;
    gap: 12px;
    min-width: min(360px, 100%);
  }

  .progress-wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px;
    gap: 10px;
    align-items: center;
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
    border-radius: inherit;
    background: var(--accent);
  }

  .progress-fill.indeterminate {
    width: 35%;
    animation: progress-slide 1.1s ease-in-out infinite;
  }

  .progress-message,
  .progress-detail {
    color: var(--muted);
    font-size: 13px;
  }

  .progress-message,
  .progress-error,
  .progress-detail {
    margin: 0;
    line-height: 1.45;
  }

  .progress-error {
    color: var(--text);
    font-size: 13px;
  }

  .progress-percent {
    color: var(--text);
    font-size: 13px;
    text-align: right;
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
