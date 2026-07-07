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

  let retrievalMode = $state<RetrievalMode>(
    readRetrievalMode(appState.retrievalMode),
  );
  let ragTopK = $state<number | undefined>(appState.ragTopK);
  let busy = $state(false);
  let popupOpen = $state(false);
  let searchQuery = $state("");
  let searchLoading = $state(false);

  type SearchMatch = {
    chunkId: string;
    sourceTitle: string;
    pageIndex: number;
    content: string;
    score: number;
  };

  let bm25Results = $state<SearchMatch[]>([]);
  let semanticResults = $state<SearchMatch[]>([]);
  let hybridResults = $state<SearchMatch[]>([]);

  onMount(() => {
    loadSettings();
  });

  function readRetrievalMode(value: unknown): RetrievalMode {
    if (value === "semantic" || value === "bm25" || value === "hybrid") {
      return value;
    }

    return "hybrid";
  }

  function syncSettingsFields() {
    retrievalMode = readRetrievalMode(appState.retrievalMode);
    ragTopK = appState.ragTopK;
  }

  async function loadSettings() {
    const resp = await fetch("/settings", {
      method: "GET",
    });

    const settings = (await resp.json()) as UserSettings;
    appState.applySettings(settings);
    syncSettingsFields();
  }

  async function saveRuntimeSettings(message = "Search settings updated") {
    busy = true;
    appState.retrievalMode = retrievalMode;
    appState.ragTopK = ragTopK ?? 5;

    const resp = await fetch("/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appState.settings),
    });

    if (!resp.ok) {
      busy = false;
      showToast("Search settings save failed");
      return;
    }

    const settings = (await resp.json()) as UserSettings;
    appState.applySettings(settings);
    syncSettingsFields();
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

  function myFunction() {
    popupOpen = !popupOpen;
    if (popupOpen) {
      searchQuery = appState.lastQuery;
    } else {
      bm25Results = [];
      semanticResults = [];
      hybridResults = [];
    }
  }

  async function runSearch() {
    if (!searchQuery.trim()) return;
    searchLoading = true;
    bm25Results = [];
    semanticResults = [];
    hybridResults = [];

    const params = new URLSearchParams({
      query: searchQuery,
      topK: String(appState.topK),
    });

    const resp = await fetch(`/search?${params}`);
    const data = await resp.json();
    bm25Results = data.bm25;
    semanticResults = data.semantic;
    hybridResults = data.hybrid;
    searchLoading = false;
  }

  function sendResultToNotebook(result: SearchMatch) {
    const text = `${result.sourceTitle} (page ${result.pageIndex + 1})\n${result.content}`;
    window.dispatchEvent(
      new CustomEvent("dk:send-to-notebook", { detail: { text } }),
    );
    showToast("Sent to notebook");
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

    <button class="popup-trigger" type="button" onclick={myFunction}>Compare Search Results</button>

    {#if popupOpen}
      <div class="popup-overlay" role="presentation" onclick={myFunction}></div>
      <div class="popup-window search-compare-popup" role="dialog" aria-label="Search comparison">
        <div class="popup-header">
          <span class="popup-title">Search Comparison</span>
          <button class="btn btn-icon" type="button" onclick={myFunction}>✕</button>
        </div>

        <div class="popup-search-bar">
          <input
            class="input"
            type="text"
            placeholder="Enter query…"
            bind:value={searchQuery}
            onkeydown={(e) => e.key === "Enter" && runSearch()}
          />
          <button class="btn" type="button" onclick={runSearch} disabled={searchLoading}>
            {searchLoading ? "Searching…" : "Search"}
          </button>
        </div>

        <div class="search-panes">
          {#each [{ label: "BM25", results: bm25Results }, { label: "Semantic", results: semanticResults }, { label: "Hybrid", results: hybridResults }] as pane}
            <div class="search-pane">
              <div class="pane-label">{pane.label}</div>
              {#each pane.results as result, i (result.chunkId)}
                <div class="result-card">
                  <div class="result-meta">
                    <span class="result-rank">#{i + 1}</span>
                    <span class="result-title">{result.sourceTitle}</span>
                    <span>Page {result.pageIndex + 1}</span>
                    <span>Score: {result.score.toFixed(4)}</span>
                  </div>
                  <p class="result-content">{result.content}</p>
                  <button
                    class="btn send-to-notebook-btn"
                    type="button"
                    onclick={() => sendResultToNotebook(result)}
                  >
                    Send to Notebook
                  </button>
                </div>
              {:else}
                {#if !searchLoading}
                  <p class="no-results">No results</p>
                {/if}
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {/if}

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

  .popup-trigger {
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }

  .popup-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 200;
  }

  .popup-window {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 201;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 20px;
    min-width: 300px;
    display: grid;
    gap: 14px;
  }

  .search-compare-popup {
    width: min(92vw, 960px);
    height: 82vh;
    grid-template-rows: auto auto 1fr;
    overflow: hidden;
  }

  .popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .popup-title {
    font-size: 14px;
    font-weight: 600;
  }

  .popup-search-bar {
    display: flex;
    gap: 8px;
  }

  .popup-search-bar .input {
    flex: 1;
  }

  .search-panes {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .search-pane {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-x: hidden;
    overflow-y: auto;
    min-height: 0;
    min-width: 0;
  }

  .pane-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    position: sticky;
    top: 0;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    padding-bottom: 4px;
  }

  .result-card {
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 3%));
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
    width: 100%;
    box-sizing: border-box;
    min-width: 0;
    overflow: hidden;
  }

  .result-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    color: var(--muted);
  }

  .result-rank {
    font-size: 10px;
    font-weight: 700;
    color: var(--text);
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 10%));
    border-radius: 4px;
    padding: 1px 5px;
    align-self: flex-start;
  }

  .result-title {
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-content {
    font-size: 12px;
    margin: 0;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    word-break: break-word;
    min-width: 0;
    max-width: 100%;
  }

  .send-to-notebook-btn {
    align-self: flex-start;
    padding: 4px 10px;
    font-size: 11px;
  }

  .no-results {
    font-size: 12px;
    color: var(--muted);
    font-style: italic;
    margin: 0;
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
