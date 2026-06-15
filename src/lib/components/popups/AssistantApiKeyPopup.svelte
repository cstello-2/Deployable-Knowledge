<script lang="ts">
  type ProviderRecord = {
    id: string;
    label?: string;
    api_key_required: boolean;
    has_api_key: boolean;
    available: boolean;
    models?: string[];
  };

  type Props = {
    open: boolean;
    onClose?: () => void;
    onChanged?: () => void | Promise<void>;
    onToast?: (message: string) => void;
  };

  let {
    open,
    onClose = () => {},
    onChanged = () => {},
    onToast = () => {},
  }: Props = $props();

  let providers = $state<ProviderRecord[]>([]);
  let keyInputs = $state<Record<string, string>>({});
  let loading = $state(false);
  let error = $state("");

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();

      try {
        const data = JSON.parse(text);
        throw new Error(data.error || data.detail || text);
      } catch {
        throw new Error(text || `Request failed: ${response.status}`);
      }
    }

    return await response.json();
  }

  async function loadProviders() {
    loading = true;
    error = "";

    try {
      const data = await requestJson(
        "/providers?include_unavailable=true&refresh=true",
      );

      providers = data.providers ?? [];
      keyInputs = Object.fromEntries(
        providers.map((provider) => [provider.id, ""]),
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function saveProvider(provider: ProviderRecord) {
    const apiKey = String(keyInputs[provider.id] ?? "").trim();

    if (provider.api_key_required && !apiKey) {
      onToast("Enter an API key to save");
      return;
    }

    try {
      await requestJson(`/providers/${encodeURIComponent(provider.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          api_key: apiKey,
        }),
      });

      await loadProviders();
      await onChanged();
      onToast("Provider saved");
    } catch (err) {
      alert("Provider save failed: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function clearProvider(provider: ProviderRecord) {
    try {
      await requestJson(
        `/providers/${encodeURIComponent(provider.id)}/api-key`,
        {
          method: "DELETE",
        },
      );

      await loadProviders();
      await onChanged();
      onToast("API key cleared");
    } catch (err) {
      alert("API key clear failed: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  function closeFromBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  $effect(() => {
    if (open) {
      loadProviders();
    }
  });
</script>

{#if open}
  <div 
    class="api-key-manager-overlay" 
    role="button"
    tabindex="0"
    onclick={closeFromBackdrop}
    onkeydown={(event) => {
      if (event.key ==="Escape") {
        onClose();
      }
    }}
    >
    <div
      class="api-key-manager"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-manager-title"
    >
      <div class="api-key-manager-head">
        <h2 id="api-key-manager-title">API Keys</h2>

        <button
          type="button"
          class="btn api-key-manager-close"
          aria-label="Close"
          onclick={onClose}
        >
          Close
        </button>
      </div>

      <div class="api-key-provider-list">
        {#if loading}
          <div class="api-key-manager-empty">Loading providers...</div>
        {:else if error}
          <div class="api-key-manager-empty">
            Provider load failed: {error}
          </div>
        {:else if !providers.length}
          <div class="api-key-manager-empty">No providers found.</div>
        {:else}
          {#each providers as provider (provider.id)}
            <div class="api-key-provider-row">
              <div class="api-key-provider-main">
                <div>
                  <div class="api-key-provider-name">
                    {provider.label || provider.id}
                  </div>

                  <div
                    class:connected={provider.available}
                    class="api-key-provider-status"
                  >
                    {provider.available ? "Connected" : "Not connected"}
                  </div>
                </div>
              </div>

              <div class="api-key-provider-controls">
                <input
                  class="input api-key-input"
                  type="password"
                  autocomplete="off"
                  placeholder={provider.has_api_key ? "Saved API key" : "API key"}
                  disabled={!provider.api_key_required}
                  bind:value={keyInputs[provider.id]}
                />

                <div class="api-key-provider-actions">
                  <button
                    type="button"
                    class="btn api-key-save"
                    onclick={() => saveProvider(provider)}
                  >
                    Save
                  </button>

                  <button
                    type="button"
                    class="btn api-key-clear"
                    disabled={!provider.api_key_required}
                    onclick={() => clearProvider(provider)}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .api-key-manager-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: grid;
    place-items: center;
    padding: 20px;
    background: color-mix(in oklab, black 52%, transparent);
  }

  .api-key-manager {
    width: min(680px, 100%);
    max-height: min(720px, 92vh);
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .api-key-manager-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 16px;
    border-bottom: 1px solid var(--border);
  }

  .api-key-manager-head h2 {
    margin: 0;
    font-size: 16px;
  }

  .api-key-provider-list {
    display: grid;
    gap: 10px;
    padding: 16px;
  }

  .api-key-manager-empty {
    color: var(--muted);
    font-size: 13px;
  }

  .api-key-provider-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 1.4fr);
    gap: 12px;
    align-items: center;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
  }

  .api-key-provider-name {
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }

  .api-key-provider-status {
    margin-top: 3px;
    color: var(--muted);
    font-size: 12px;
  }

  .api-key-provider-status.connected {
    color: color-mix(in oklab, lime 65%, var(--text));
  }

  .api-key-provider-controls {
    display: grid;
    gap: 8px;
  }

  .api-key-provider-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 3%));
    color: var(--text);
  }

  .input:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .btn {
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
  }

  .btn:hover:not(:disabled) {
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 4%));
  }

  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  @media (max-width: 680px) {
    .api-key-provider-row {
      grid-template-columns: 1fr;
    }
  }
</style>