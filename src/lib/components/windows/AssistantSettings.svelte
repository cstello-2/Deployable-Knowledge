<script lang="ts">
  import { getContext, onMount } from "svelte";

  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import {
    AssistantApiKeyPopup,
    PromptTemplatePopup,
  } from "$lib/components/popups";
  import type { WindowInstanceProps } from "./index";
  import type { AppState } from "$lib/state.svelte";
  import type { Provider } from "$lib/server/providers/provider";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import type {
    PromptTemplate,
    UserSettings,
  } from "$lib/server/database/schema";

  type ProviderOption = Pick<Provider, "id" | "name">;
  type PromptTemplateFormValue = {
    id?: string;
    name: string;
    description: string;
    systemPrompt: string;
  };

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
  let providers = $state<ProviderOption[]>([]);
  let models = $state<string[]>([]);
  let temperature = $state<number | undefined>(appState.temperature);
  let topK = $state<number | undefined>(appState.topK);
  let maxTokens = $state<number | undefined>(appState.maxTokens);
  let persona = $state(appState.persona);
  let apiKeyPopupOpen = $state(false);
  let templatePopupOpen = $state(false);
  let templateMenuOpen = $state(false);
  let editingTemplate = $state<PromptTemplate | null>(null);
  let templateMenuElement = $state<HTMLElement | null>(null);
  let selectedTemplate = $derived(
    appState.promptTemplates.find(
      (template) => template.id === appState.promptTemplateId,
    ) ?? null,
  );

  onMount(() => {
    initialize();

    function handleDocumentPointerDown(event: PointerEvent) {
      if (!templateMenuOpen || !templateMenuElement) return;
      if (
        event.target instanceof Node &&
        templateMenuElement.contains(event.target)
      ) {
        return;
      }

      templateMenuOpen = false;
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
    };
  });

  async function initialize() {
    await loadSettings();
    await loadPromptTemplates();
    await loadProviders();
    await loadModels();
  }

  function syncSettingsFields() {
    temperature = appState.temperature;
    topK = appState.topK;
    maxTokens = appState.maxTokens;
    persona = appState.persona;
  }

  async function loadSettings() {
    const resp = await fetch("/settings", {
      method: "GET",
    });

    const settings = (await resp.json()) as UserSettings;
    appState.applySettings(settings);
    syncSettingsFields();
  }

  async function loadProviders() {
    const resp = await fetch("/providers?available=true", {
      method: "GET",
    });

    providers = (await resp.json()) as ProviderOption[];

    if (
      providers.length &&
      !providers.some((provider) => provider.id === appState.currentProviderId)
    ) {
      appState.currentProviderId = providers[0].id;
    }
  }

  async function loadModels() {
    if (!appState.currentProviderId) {
      models = [];
      appState.currentModelId = "";
      return;
    }

    const providerId = encodeURIComponent(appState.currentProviderId);
    const resp = await fetch(
      `/providers/${providerId}?available=true`,
      { method: "GET" },
    );

    models = (await resp.json()) as string[];

    if (models.length && !models.includes(appState.currentModelId)) {
      appState.currentModelId = models[0];
    } else if (!models.length) {
      appState.currentModelId = "";
    }
  }

  async function loadPromptTemplates() {
    const resp = await fetch("/prompt-templates", { method: "GET" });

    if (!resp.ok) {
      showToast("Prompt templates failed to load");
      return;
    }

    const templates = (await resp.json()) as PromptTemplate[];
    appState.promptTemplates = templates;

    if (
      appState.promptTemplateId &&
      !templates.some((template) => template.id === appState.promptTemplateId)
    ) {
      appState.promptTemplateId = "";
    }
  }

  function openPromptTemplateEditor(template: PromptTemplate | null) {
    templateMenuOpen = false;
    editingTemplate = template;
    templatePopupOpen = true;
  }

  function openNewPromptTemplate() {
    openPromptTemplateEditor(null);
  }

  function openEditPromptTemplate(template: PromptTemplate) {
    openPromptTemplateEditor(template);
  }

  function closePromptTemplatePopup() {
    templatePopupOpen = false;
    editingTemplate = null;
  }

  async function savePromptTemplate(value: PromptTemplateFormValue) {
    const endpoint = value.id
      ? `/prompt-templates/${encodeURIComponent(value.id)}`
      : "/prompt-templates";

    const method = value.id ? "PATCH" : "POST";
    const resp = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: value.name,
        description: value.description,
        systemPrompt: value.systemPrompt,
      }),
    });

    if (!resp.ok) {
      throw new Error(await resp.text());
    }

    const template = (await resp.json()) as PromptTemplate;
    await loadPromptTemplates();
    appState.promptTemplateId = template.id;

    await saveRuntimeSettings(
      value.id ? "Prompt template updated" : "Prompt template created",
    );

    closePromptTemplatePopup();
  }

  async function selectPromptTemplate(templateId: string) {
    templateMenuOpen = false;

    if (appState.promptTemplateId === templateId) return;

    appState.promptTemplateId = templateId;
    await saveRuntimeSettings("Prompt template updated");
  }

  async function deletePromptTemplate(template: PromptTemplate) {
    templateMenuOpen = false;

    if (!window.confirm(`Delete "${template.name}"?`)) return;

    const resp = await fetch(
      `/prompt-templates/${encodeURIComponent(template.id)}`,
      { method: "DELETE" },
    );

    if (!resp.ok) {
      showToast("Prompt template delete failed");
      return;
    }

    const deletedSelectedTemplate = appState.promptTemplateId === template.id;

    if (deletedSelectedTemplate) appState.promptTemplateId = "";

    await loadPromptTemplates();

    if (deletedSelectedTemplate) {
      await saveRuntimeSettings("Prompt template deleted");
    } else {
      showToast("Prompt template deleted");
    }
  }

  async function saveRuntimeSettings(message = "Assistant settings updated") {
    appState.temperature = temperature ?? 0.2;
    appState.topK = topK ?? 8;
    appState.maxTokens = maxTokens ?? 512;
    appState.persona = persona;

    const resp = await fetch("/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appState.settings),
    });

    if (!resp.ok) {
      showToast("Assistant settings save failed");
      return;
    }

    const settings = (await resp.json()) as UserSettings;
    appState.applySettings(settings);
    syncSettingsFields();
    showToast(message);
  }

  async function handleRuntimeSettingsChange() {
    await saveRuntimeSettings();
  }

  async function handleProviderChange() {
    await loadModels();
    await saveRuntimeSettings();
  }

  async function handleModelChange() {
    await saveRuntimeSettings();
  }

  async function handleApiKeysChanged() {
    await loadProviders();
    await loadModels();
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
  contentLabel="Assistant settings window"
>
  <div class="form assistant-settings-form">
    <div class="row">
      <label for="tmpl_select">Prompt Template</label>

      <div class="prompt-template-menu" bind:this={templateMenuElement}>
        <button
          id="tmpl_select"
          class="input prompt-template-trigger"
          type="button"
          aria-haspopup="menu"
          aria-expanded={templateMenuOpen}
          onclick={() => (templateMenuOpen = !templateMenuOpen)}
        >
          <span>{selectedTemplate?.name ?? "None"}</span>
          <Icon name="expand_more" size={16} />
        </button>

        {#if templateMenuOpen}
          <div class="prompt-template-dropdown" role="menu">
            <button
              type="button"
              class="prompt-template-option"
              class:selected={!appState.promptTemplateId}
              role="menuitemradio"
              aria-checked={!appState.promptTemplateId}
              onclick={() => selectPromptTemplate("")}
            >
              None
            </button>

            {#each appState.promptTemplates as template (template.id)}
              <div
                class="prompt-template-item"
                class:selected={template.id === appState.promptTemplateId}
              >
                <button
                  type="button"
                  class="prompt-template-option"
                  role="menuitemradio"
                  aria-checked={template.id === appState.promptTemplateId}
                  onclick={() => selectPromptTemplate(template.id)}
                >
                  <span class="prompt-template-name">{template.name}</span>
                </button>

                <div class="prompt-template-item-actions">
                  <button
                    type="button"
                    class="btn btn-icon"
                    title="Edit prompt template"
                    aria-label={`Edit ${template.name}`}
                    onclick={() => openEditPromptTemplate(template)}
                  >
                    <Icon name="edit" size={16} />
                  </button>

                  <button
                    type="button"
                    class="btn btn-icon btn-danger"
                    title="Delete prompt template"
                    aria-label={`Delete ${template.name}`}
                    onclick={() => deletePromptTemplate(template)}
                  >
                    <Icon name="delete" size={16} />
                  </button>
                </div>
              </div>
            {/each}

            <button
              type="button"
              class="prompt-template-create"
              role="menuitem"
              onclick={openNewPromptTemplate}
            >
              <Icon name="add" size={16} />
              <span>Create prompt template</span>
            </button>
          </div>
        {/if}
      </div>
    </div>

    <div
      class="row assistant-compact-row"
      style="display: flex; align-items: end; justify-content: space-between; gap: 10px; flex-wrap: nowrap; width: 100%;"
    >
      <div
        class="assistant-number-settings"
        style="display: grid; grid-template-columns: 90px 75px 105px; align-items: end; gap: 8px; flex: 0 0 auto;"
      >
        <div class="assistant-compact-field">
          <label for="assistant_temperature">Temperature</label>
          <input
            id="assistant_temperature"
            class="input"
            type="number"
            min="0"
            max="2"
            step="0.1"
            placeholder="0.2"
            style="width: 100%; box-sizing: border-box;"
            bind:value={temperature}
            onchange={handleRuntimeSettingsChange}
          />
        </div>

        <div class="assistant-compact-field">
          <label for="assistant_top_k">Top K</label>
          <input
            id="assistant_top_k"
            class="input"
            type="number"
            min="0"
            step="1"
            placeholder="8"
            style="width: 100%; box-sizing: border-box;"
            bind:value={topK}
            onchange={handleRuntimeSettingsChange}
          />
        </div>

        <div class="assistant-compact-field">
          <label for="assistant_max_tokens">Max Tokens</label>
          <input
            id="assistant_max_tokens"
            class="input"
            type="number"
            min="1"
            step="1"
            placeholder="512"
            style="width: 100%; box-sizing: border-box;"
            bind:value={maxTokens}
            onchange={handleRuntimeSettingsChange}
          />
        </div>
      </div>

      <div
        class="assistant-manage-buttons"
        style="display: flex; align-items: end; gap: 6px; margin-left: auto;"
      >
        <button
          type="button"
          class="btn"
          id="manage_mcps"
          onclick={() => showToast("MCP manager coming soon")}
        >
          Manage MCP's
        </button>

        <button
          type="button"
          class="btn"
          id="manage_api_keys"
          onclick={() => (apiKeyPopupOpen = true)}
        >
          Manage API Keys
        </button>
      </div>
    </div>

    <div class="row">
      <label for="assistant_persona">Persona</label>
      <textarea
        id="assistant_persona"
        class="textarea"
        placeholder="Write the persona instructions here."
        style="min-height: 90px;"
        bind:value={persona}
        onchange={handleRuntimeSettingsChange}
      ></textarea>
    </div>

    <div class="row">
      <label for="assistant_llm_provider">LLM Provider</label>

      <select
        id="assistant_llm_provider"
        class="input"
        bind:value={appState.currentProviderId}
        onchange={handleProviderChange}
      >
        {#each providers as provider (provider.id)}
          <option value={provider.id}>{provider.name}</option>
        {:else}
          <option value="ollama">Ollama</option>
        {/each}
      </select>
    </div>

    <div class="row">
      <label for="assistant_llm_model">Chat Model</label>
      <select
        id="assistant_llm_model"
        class="input"
        bind:value={appState.currentModelId}
        disabled={!models.length}
        onchange={handleModelChange}
      >
        {#each models as model (model)}
          <option value={model}>{model}</option>
        {:else}
          <option value="">No models available</option>
        {/each}
      </select>
    </div>
  </div>
</BaseWindow>

<PromptTemplatePopup
  open={templatePopupOpen}
  template={editingTemplate}
  onClose={closePromptTemplatePopup}
  onSave={savePromptTemplate}
/>

<AssistantApiKeyPopup
  open={apiKeyPopupOpen}
  onClose={() => (apiKeyPopupOpen = false)}
  onChanged={handleApiKeysChanged}
/>

<style>
  .assistant-settings-form {
    display: grid;
    gap: 10px;
  }

  .prompt-template-menu {
    position: relative;
  }

  .prompt-template-trigger {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    text-align: left;
  }

  .prompt-template-trigger span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prompt-template-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 100;
    display: grid;
    width: min(240px, 100%);
    max-height: 260px;
    overflow: auto;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) - 1%));
    box-shadow: var(--shadow);
    gap: 4px;
  }

  .prompt-template-create,
  .prompt-template-option {
    width: 100%;
    min-width: 0;
    justify-content: flex-start;
    border: 0;
    border-radius: 8px;
    background: transparent;
    text-align: left;
  }

  .prompt-template-create {
    display: inline-flex;
    gap: 8px;
    color: var(--muted);
  }

  .prompt-template-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    border-radius: 8px;
    gap: 6px;
  }

  .prompt-template-item:hover,
  .prompt-template-item.selected,
  .prompt-template-option.selected {
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 5%));
  }

  .prompt-template-item-actions {
    display: inline-flex;
    padding-right: 4px;
    gap: 4px;
  }

  .prompt-template-name {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .assistant-compact-field {
    display: grid;
    gap: 4px;
  }

  .assistant-compact-field label {
    font-size: 12px;
  }

  @media (max-width: 720px) {
    .assistant-compact-row {
      flex-wrap: wrap !important;
    }

    .assistant-number-settings {
      grid-template-columns: 1fr !important;
      width: 100%;
    }

    .assistant-manage-buttons {
      margin-left: 0 !important;
    }

    .prompt-template-dropdown {
      width: 100%;
    }
  }
</style>
