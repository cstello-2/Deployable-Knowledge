<script lang="ts">
  import Popup from "$lib/components/popups/Popup.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";

  type ApiKeyProvider = {
    id: string;
    name: string;
    apiKeyRequired: boolean;
  };

  type Props = {
    open: boolean;
    onClose: () => void;
    onChanged?: () => Promise<void> | void;
  };

  let { open, onClose, onChanged = () => {} }: Props = $props();
  let providers = $state<ApiKeyProvider[]>([]);
  let apiKeyInputs = $state<Record<string, string>>({});
  let loading = $state(false);

  $effect(() => {
    if (!open) {
      providers = [];
      apiKeyInputs = {};
      return;
    }

    loadProviders();
  });

  async function loadProviders() {
    loading = true;
    const resp = await fetch("/providers", { method: "GET" });

    providers = (await resp.json()) as ApiKeyProvider[];
    apiKeyInputs = {};
    loading = false;
  }

  function setApiKeyInput(providerId: string, value: string) {
    apiKeyInputs = {
      ...apiKeyInputs,
      [providerId]: value,
    };
  }

  async function saveProviderApiKey(provider: ApiKeyProvider) {
    const apiKey = (apiKeyInputs[provider.id] || "").trim();

    if (!apiKey) {
      showToast("Enter an API key to save");
      return;
    }

    await fetch(`/providers/${encodeURIComponent(provider.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });

    await onChanged();
    await loadProviders();
    showToast("API key saved");
  }

  async function clearProviderApiKey(provider: ApiKeyProvider) {
    await fetch(`/providers/${encodeURIComponent(provider.id)}`, {
      method: "DELETE",
    });

    await onChanged();
    await loadProviders();
    showToast("API key cleared");
  }
</script>

{#snippet providerRow(provider: ApiKeyProvider)}
  <div class="api-key-provider-row">
    <div class="api-key-provider-main">
      <div class="api-key-provider-name">{provider.name}</div>

      <div class="api-key-provider-status" class:connected={!provider.apiKeyRequired}>
        {#if !provider.apiKeyRequired}
          No API key required
        {:else}
          API key required
        {/if}
      </div>
    </div>

    {#if provider.apiKeyRequired}
      <div class="api-key-provider-controls">
        <input
          class="input api-key-input"
          type="password"
          autocomplete="off"
          placeholder="API key"
          value={apiKeyInputs[provider.id] || ""}
          oninput={(event) =>
            setApiKeyInput(provider.id, event.currentTarget.value)}
        />

        <div class="api-key-provider-actions">
          <button
            type="button"
            class="btn btn-primary"
            onclick={() => saveProviderApiKey(provider)}
          >
            Save
          </button>

          <button
            type="button"
            class="btn"
            onclick={() => clearProviderApiKey(provider)}
          >
            Clear
          </button>
        </div>
      </div>
    {:else}
      <div class="api-key-provider-note">Local provider</div>
    {/if}
  </div>
{/snippet}

<Popup
  {open}
  title="API Keys"
  id="api-key-manager"
  contentLabel="API key manager"
  width="720px"
  {onClose}
>
  <div class="api-key-manager">
    {#if loading}
      <div class="api-key-manager-empty">Loading providers...</div>
    {:else}
      <div class="api-key-provider-list">
        {#each providers as provider (provider.id)}
          {@render providerRow(provider)}
        {:else}
          <div class="api-key-manager-empty">No providers found.</div>
        {/each}
      </div>
    {/if}
  </div>
</Popup>

<style>
  .api-key-manager {
    display: grid;
    max-height: min(720px, calc(100vh - 80px));
    overflow: auto;
    color: var(--text);
    gap: 12px;
  }

  .api-key-provider-list {
    display: grid;
    gap: 10px;
  }

  .api-key-provider-row {
    display: grid;
    grid-template-columns: minmax(160px, 1fr) minmax(260px, 2fr);
    gap: 12px;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px;
  }

  .api-key-provider-name {
    font-weight: 600;
  }

  .api-key-provider-status,
  .api-key-provider-note,
  .api-key-manager-empty {
    color: var(--muted);
    font-size: 12px;
  }

  .api-key-provider-status.connected {
    color: var(--accent);
  }

  .api-key-provider-note {
    justify-self: end;
  }

  .api-key-provider-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }

  .api-key-provider-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .api-key-manager-empty {
    padding: 12px;
  }

  @media (max-width: 720px) {
    .api-key-provider-row {
      grid-template-columns: 1fr;
    }

    .api-key-provider-controls {
      grid-template-columns: 1fr;
    }

    .api-key-provider-actions {
      justify-content: flex-start;
    }

    .api-key-provider-note {
      justify-self: start;
    }
  }
</style>
