<script lang="ts">
  import Popup from "$lib/components/Popup.svelte";
  // import { dkClient, type ProviderRecord } from "$lib/client/sdk";
  //
  // type ApiKeyProvider = ProviderRecord & {
  //   available?: boolean;
  //   api_key_required?: boolean;
  //   has_api_key?: boolean;
  // };

  // type Props = {
  //   open: boolean;
  //   onClose: () => void;
  //   onChanged?: () => Promise<void> | void;
  //   onToast?: (message: string) => void;
  // };
  //
  // let {
  //   open,
  //   onClose,
  //   onChanged = () => {},
  //   onToast = () => {},
  // }: Props = $props();
  //
  // // let providersPromise = $state<Promise<ApiKeyProvider[]> | null>(null);
  // let apiKeyInputs = $state<Record<string, string>>({});
  //
  // $effect(() => {
  //   if (!open) {
  //     providersPromise = null;
  //     apiKeyInputs = {};
  //     return;
  //   }
  //
  //   apiKeyInputs = {};
  //   refreshProviders();
  // });
  //
  // async function fetchApiKeyProviders() {
  //   const data = await dkClient.listProviders({
  //     includeUnavailable: true,
  //     refresh: true,
  //   });
  //
  //   return (data?.providers || []) as ApiKeyProvider[];
  // }
  //
  // function refreshProviders() {
  //   providersPromise = fetchApiKeyProviders();
  // }
  //
  // function setApiKeyInput(providerId: string, value: string) {
  //   apiKeyInputs = {
  //     ...apiKeyInputs,
  //     [providerId]: value,
  //   };
  // }
  //
  // async function saveProviderApiKey(provider: ApiKeyProvider) {
  //   const key = (apiKeyInputs[provider.id] || "").trim();
  //
  //   if (provider.api_key_required && !key) {
  //     onToast("Enter an API key to save");
  //     return;
  //   }
  //
  //   try {
  //     await dkClient.patchProvider(provider.id, {
  //       api_key: key,
  //     });
  //
  //     await onChanged();
  //     refreshProviders();
  //     onToast("Provider saved");
  //   } catch (error) {
  //     alert(`Provider save failed: ${error}`);
  //   }
  // }
  //
  // async function clearProviderApiKey(provider: ApiKeyProvider) {
  //   try {
  //     await dkClient.clearProviderApiKey(provider.id);
  //     await onChanged();
  //     refreshProviders();
  //     onToast("API key cleared");
  //   } catch (error) {
  //     alert(`API key clear failed: ${error}`);
  //   }
  // }
</script>

<!-- {#snippet apiKeyProviderRow(provider: ApiKeyProvider)} -->
<!--   <div class="api-key-provider-row"> -->
<!--     <div class="api-key-provider-main"> -->
<!--       <div> -->
<!--         <div class="api-key-provider-name">{provider.label || provider.id}</div> -->
<!---->
<!--         <div -->
<!--           class:connected={provider.available} -->
<!--           class="api-key-provider-status" -->
<!--         > -->
<!--           {#if provider.available} -->
<!--             Connected -->
<!--           {:else} -->
<!--             Not connected -->
<!--           {/if} -->
<!--         </div> -->
<!--       </div> -->
<!--     </div> -->
<!---->
<!--     <div class="api-key-provider-controls"> -->
<!--       <input -->
<!--         class="input api-key-input" -->
<!--         type="password" -->
<!--         autocomplete="off" -->
<!--         placeholder={provider.has_api_key ? "Saved API key" : "API key"} -->
<!--         disabled={!provider.api_key_required} -->
<!--         value={apiKeyInputs[provider.id] || ""} -->
<!--         oninput={(event) => -->
<!--           setApiKeyInput(provider.id, event.currentTarget.value)} -->
<!--       /> -->
<!---->
<!--       <div class="api-key-provider-actions"> -->
<!--         <button -->
<!--           type="button" -->
<!--           class="btn api-key-save" -->
<!--           onclick={() => saveProviderApiKey(provider)} -->
<!--         > -->
<!--           Save -->
<!--         </button> -->
<!---->
<!--         <button -->
<!--           type="button" -->
<!--           class="btn api-key-clear" -->
<!--           disabled={!provider.api_key_required} -->
<!--           onclick={() => clearProviderApiKey(provider)} -->
<!--         > -->
<!--           Clear -->
<!--         </button> -->
<!--       </div> -->
<!--     </div> -->
<!--   </div> -->
<!-- {/snippet} -->

<!-- <Popup -->
<!--   {open} -->
<!--   title="API Keys" -->
<!--   id="api-key-manager" -->
<!--   contentLabel="API key manager" -->
<!--   width="720px" -->
<!--   {onClose} -->
<!-- > -->
<!--   <div class="api-key-manager"> -->
<!--     <div class="api-key-provider-list"> -->
<!--       {#if providersPromise} -->
<!--         {#await providersPromise} -->
<!--           <div class="api-key-manager-empty">Loading providers...</div> -->
<!--         {:then apiKeyProviders} -->
<!--           {#each apiKeyProviders as provider (provider.id)} -->
<!--             {@render apiKeyProviderRow(provider)} -->
<!--           {:else} -->
<!--             <div class="api-key-manager-empty">No providers found.</div> -->
<!--           {/each} -->
<!--         {:catch error} -->
<!--           <div class="api-key-manager-empty"> -->
<!--             Provider load failed: {error} -->
<!--           </div> -->
<!--         {/await} -->
<!--       {:else} -->
<!--         <div class="api-key-manager-empty">Loading providers...</div> -->
<!--       {/if} -->
<!--     </div> -->
<!--   </div> -->
<!-- </Popup> -->

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

  .api-key-provider-status {
    color: var(--muted);
    font-size: 12px;
  }

  .api-key-provider-status.connected {
    color: var(--accent);
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
    color: var(--muted);
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
  }
</style>
