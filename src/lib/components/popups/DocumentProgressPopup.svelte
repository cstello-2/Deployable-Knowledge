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
    files?: Array<{ path: string; name: string; status: string; message?: string }>;
    complete?: boolean;
    onClose?: () => void;
  };

  let {
    open,
    title = "Working",
    progress = null,
    files = [],
    complete = false,
    onClose = () => {},
  }: Props = $props();

  const finishedStatuses = new Set([
    "success",
    "error",
    "added",
    "updated",
    "unchanged",
    "removed",
    "failed",
  ]);

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
  let finishedFiles = $derived(files.filter((file) => finishedStatuses.has(file.status)).length);
  let hasFiles = $derived(files.length > 0);
  let displayedPercent = $derived(
    hasFiles ? (finishedFiles / files.length) * 100 : complete && !hasTotal ? 100 : percent,
  );
  let label = $derived(progress?.label || title);
  let message = $derived(progress?.message || "Please wait.");

  function statusLabel(status: string) {
    return status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
  }
</script>

<Popup
  {open}
  id="document-progress"
  title={hasFiles ? `${label}: ${finishedFiles}/${files.length}` : hasTotal ? `${label}: ${percent.toFixed(1)}%` : label}
  contentLabel="Document progress"
  closeOnBackdrop={false}
  closable={complete}
  {onClose}
>
  <div class="progress-body" aria-live="polite" aria-busy={open}>
    <div class="progress-wrap" aria-hidden="true">
      <div class="progress-track">
        <div
          class:indeterminate={!hasTotal && !hasFiles && !complete}
          class="progress-fill"
          style:width={hasTotal || hasFiles || complete ? `${displayedPercent}%` : undefined}
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

    {#if hasFiles}
      <div class="progress-files">
        {#each files as file (file.path)}
          <div class="progress-file" title={file.path}>
            <div class="progress-file-name">{file.name}</div>
            <div class:failed={file.status === "failed" || file.status === "error"} class="progress-file-status">
              {statusLabel(file.status)}
            </div>
            {#if file.message}<div class="progress-file-error">{file.message}</div>{/if}
          </div>
        {/each}
      </div>
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

  .progress-files {
    display: grid;
    max-height: 320px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .progress-file {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 12px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
  }

  .progress-file:last-child {
    border-bottom: 0;
  }

  .progress-file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .progress-file-status {
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }

  .progress-file-status.failed,
  .progress-file-error {
    color: var(--danger, #d45b5b);
  }

  .progress-file-error {
    grid-column: 1 / -1;
    font-size: 11px;
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
