<script lang="ts">
  import { getContext, onMount } from "svelte";

  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import type { AppState } from "$lib/state.svelte";
  import type { UserSettings } from "$lib/server/database/schema";
  import type { WindowInstanceProps } from "./index";

  type RetrievalMode = UserSettings["retrievalMode"];

  let {
    id,
    title,
    closable = false,
    height = null,
    collapsed = false,
    onToggleCollapse = () => {},
    onClose = () => {},
  }: WindowInstanceProps = $props();

  const appState = getContext<AppState>("appState");
  const retrievalModes: { id: RetrievalMode; label: string }[] = [
    { id: "semantic", label: "Semantic" },
    { id: "bm25", label: "BM25" },
    { id: "hybrid", label: "Hybrid" },
  ];

  let retrievalMode = $state<RetrievalMode>("hybrid");
  let ragTopK = $state<number | undefined>(appState.ragTopK);
  let busy = $state(false);

  onMount(() => {
    loadSettings();
  });

  function readRetrievalMode(value: unknown): RetrievalMode {
    if (value === "semantic" || value === "bm25" || value === "hybrid") {
      return value;
    }

    return "hybrid";
  }

  function syncSettingsFields(settings: UserSettings) {
    retrievalMode = readRetrievalMode(settings.retrievalMode);
    ragTopK = settings.ragTopK ?? 5;
  }

  function setAppState(settings: UserSettings) {
    appState.currentProviderId = settings.provider || "ollama";
    appState.currentModelId = settings.model || "granite4:350m";
    appState.maxTokens = settings.maxTokens ?? 512;
    appState.temperature = settings.temperature ?? 0.2;
    appState.topK = settings.topK ?? 8;
    appState.promptTemplateId = settings.promptTemplateId || "";
    appState.persona = settings.persona || "";
    appState.ragTopK = settings.ragTopK ?? 5;
  }

  function getSettingsPayload() {
    return {
      provider: appState.currentProviderId,
      model: appState.currentModelId,
      maxTokens: appState.maxTokens,
      temperature: appState.temperature,
      topK: appState.topK,
      promptTemplateId: appState.promptTemplateId || null,
      persona: appState.persona,
      retrievalMode,
      ragTopK: appState.ragTopK,
    };
  }

  async function loadSettings() {
    const resp = await fetch("/settings", {
      method: "GET",
    });

    const settings = (await resp.json()) as UserSettings;
    setAppState(settings);
    syncSettingsFields(settings);
  }

  async function saveRuntimeSettings(message = "Search settings updated") {
    busy = true;
    appState.ragTopK = ragTopK ?? 5;

    const resp = await fetch("/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getSettingsPayload()),
    });

    if (!resp.ok) {
      busy = false;
      showToast("Search settings save failed");
      return;
    }

    const settings = (await resp.json()) as UserSettings;
    setAppState(settings);
    syncSettingsFields(settings);
    busy = false;
    showToast(message);
  }

  async function handleRetrievalModeChange(mode: RetrievalMode) {
    if (busy || retrievalMode === mode) return;

    retrievalMode = mode;
    await saveRuntimeSettings();
  }

  async function handleRuntimeSettingsChange() {
    if (busy) return;

    await saveRuntimeSettings();
  }
</script>

<BaseWindow
  {id}
  {title}
  {closable}
  {height}
  {collapsed}
  {onToggleCollapse}
  {onClose}
  contentLabel="Search settings window"
>
  <div class="form search-settings-form">
    <div class="retrieval-row" aria-label="Retrieval mode">
      <span class="retrieval-label">Search Method</span>
      <div class="retrieval-toggle" role="group" aria-label="Retrieval mode">
        {#each retrievalModes as mode}
          <button
            class:active={retrievalMode === mode.id}
            type="button"
            disabled={busy}
            aria-pressed={retrievalMode === mode.id}
            onclick={() => handleRetrievalModeChange(mode.id)}
          >
            {mode.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="search-field">
      <label for="search_rag_top_k">Top k Chunks</label>
      <input
        id="search_rag_top_k"
        class="input"
        type="number"
        min="0"
        step="1"
        placeholder="5"
        bind:value={ragTopK}
        disabled={busy}
        onchange={handleRuntimeSettingsChange}
      />
    </div>
  </div>
</BaseWindow>

<style>
  .search-settings-form {
    display: grid;
    width: fit-content;
    max-width: 100%;
    gap: 10px;
  }

  .retrieval-row {
    display: grid;
    grid-template-columns: auto 210px;
    gap: 8px;
    align-items: center;
  }

  .retrieval-label {
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }

  .retrieval-toggle {
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
  }

  .retrieval-toggle button {
    min-width: 0;
    min-height: 28px;
    padding: 4px 6px;
    border: 0;
    border-left: 1px solid var(--border);
    border-radius: 0;
    background: transparent;
    color: var(--muted);
    font-size: 11px;
    font-weight: 650;
  }

  .retrieval-toggle button:first-child {
    border-left: 0;
  }

  .retrieval-toggle button.active {
    background: color-mix(in oklab, var(--accent) 18%, transparent);
    color: var(--text);
  }

  .search-field {
    display: inline-grid;
    width: fit-content;
    grid-template-columns: max-content 75px;
    gap: 8px;
    align-items: center;
    justify-content: start;
  }

  .search-field label {
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .search-field input {
    width: 80%;
    box-sizing: border-box;
  }

  @media (max-width: 420px) {
    .retrieval-row {
      grid-template-columns: 1fr;
    }

    .retrieval-toggle {
      width: min(210px, 100%);
    }
  }
</style>
