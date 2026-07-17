<script lang="ts">
  import Popup from "$lib/components/popups/Popup.svelte";

  type ProgressResponse = {
    percent?: number;
    label?: string;
    message?: string;
  };

  type Props = {
    open: boolean;
    title?: string;
    progress?: ProgressResponse | null;
    files?: Array<{ path: string; name: string; status: string; message?: string }>;
  };

  let {
    open,
    title = "Working",
    progress = null,
    files = [],
  }: Props = $props();

  let percent = $derived(Math.max(0, Math.min(100, progress?.percent ?? 0)));
  let finishedFiles = $derived(
    files.filter((file) => file.status !== "queued" && file.status !== "ingesting").length,
  );
  let message = $derived(progress?.message || "Please wait.");

  function statusLabel(status: string) {
    return status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
  }
</script>

<Popup
  {open}
  id="document-progress"
  title={files.length ? `${title}: ${finishedFiles}/${files.length}` : title}
  contentLabel="Document progress"
  closeOnBackdrop={false}
>
  <div class="progress-body" aria-live="polite" aria-busy={open}>
    <div class="progress-wrap">
      <div
        class="progress-track"
        role="progressbar"
        aria-label={title}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(percent)}
      >
        <div class="progress-fill" style:width={`${percent}%`}></div>
      </div>
      <strong class="progress-percent">{Math.round(percent)}%</strong>
    </div>
    <div class="progress-message">{message}</div>

    {#if files.length}
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
    border-radius: 999px;
    background: var(--accent);
    transition: width 180ms ease;
  }

  .progress-message {
    color: var(--muted);
    font-size: 13px;
  }

  .progress-percent {
    color: var(--text);
    font-size: 13px;
    text-align: right;
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

</style>
