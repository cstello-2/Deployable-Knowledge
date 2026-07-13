<script lang="ts">
  import { getContext, onMount } from "svelte";

  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Dropdown from "$lib/components/menus/Dropdown.svelte";
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
    ActiveAssistantProfile,
    AssistantProfile,
    AssistantProfileActivationResponse,
    AssistantProfileListResponse,
    AssistantProfileValues,
    PromptTemplate,
    PromptTemplateFormValue,
  } from "$lib/server/database/schema";

  type ProviderOption = Pick<Provider, "id" | "name">;
  type ProviderModelGroup = ProviderOption & {
    models: string[];
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
  let providerModelGroups = $state<ProviderModelGroup[]>([]);
  let profiles = $state<AssistantProfile[]>([]);
  let temperature = $state<number | undefined>(appState.temperature);
  let topK = $state<number | undefined>(appState.topK);
  let maxTokens = $state<number | undefined>(appState.maxTokens);
  let persona = $state(appState.persona);
  let retrievalMode = $state<AssistantProfileValues["retrievalMode"]>(
    "hybrid",
  );
  let profileMenuOpen = $state(false);
  let apiKeyPopupOpen = $state(false);
  let templatePopupOpen = $state(false);
  let modelMenuOpen = $state(false);
  let templateMenuOpen = $state(false);
  let editingTemplate = $state<PromptTemplate | null>(null);
  let selectedTemplate = $derived(
    appState.promptTemplates.find(
      (template) => template.id === appState.promptTemplateId,
    ) ?? null,
  );
  let currentProfile = $derived(
    profiles.find((profile) => profile.id === appState.activeProfileId) ??
      null,
  );
  let selectedProviderModelLabel = $derived(getSelectedProviderModelLabel());
  let hasProviderModels = $derived(
    providerModelGroups.some((provider) => provider.models.length > 0),
  );

  onMount(() => {
    initialize();
  });

  async function initialize() {
    await loadActiveProfile();
    await loadProfiles();
    await loadPromptTemplates();
    await loadProviderModelGroups();
  }

  function syncProfileFields() {
    temperature = appState.temperature;
    topK = appState.topK;
    maxTokens = appState.maxTokens;
    persona = appState.persona;
  }

  function applyProfileFieldsToState() {
    appState.temperature = temperature ?? 0.2;
    appState.topK = topK ?? 8;
    appState.maxTokens = maxTokens ?? 512;
    appState.persona = persona;
  }

  function applyProfile(profile: ActiveAssistantProfile) {
    appState.activeProfileId = profile?.id ?? null;

    if (!profile) return;

    appState.currentProviderId = profile.provider || "ollama";
    appState.currentModelId = profile.model || "granite4:350m";
    appState.maxTokens = profile.maxTokens ?? 512;
    appState.temperature = profile.temperature ?? 0.2;
    appState.topK = profile.topK ?? 8;
    retrievalMode = profile.retrievalMode || "hybrid";
    appState.ragTopK = profile.ragTopK ?? 5;
    appState.promptTemplateId = profile.promptTemplateId || "";
    appState.persona = profile.persona || "";
  }

  function getProfileValues(): AssistantProfileValues {
    return {
      provider: appState.currentProviderId,
      model: appState.currentModelId,
      maxTokens: appState.maxTokens,
      temperature: appState.temperature,
      topK: appState.topK,
      retrievalMode,
      ragTopK: appState.ragTopK,
      promptTemplateId: appState.promptTemplateId || null,
      persona: appState.persona,
    };
  }

  async function loadActiveProfile() {
    const resp = await fetch("/profiles/active", {
      method: "GET",
    });
    const profile = (await resp.json()) as ActiveAssistantProfile;

    applyProfile(profile);
    syncProfileFields();
  }

  async function loadProfiles() {
    const resp = await fetch("/profiles", { method: "GET" });
    const data = (await resp.json()) as AssistantProfileListResponse;

    profiles = data.profiles;
    appState.activeProfileId = data.activeProfileId || null;
  }

  async function activateProfile(
    profile: AssistantProfile,
    message = "Profile loaded",
  ) {
    profileMenuOpen = false;

    if (profile.id === appState.activeProfileId) return;

    const resp = await fetch(
      `/profiles/${encodeURIComponent(profile.id)}/activate`,
      { method: "POST" },
    );
    const data = (await resp.json()) as AssistantProfileActivationResponse;

    applyProfile(data.profile);
    syncProfileFields();
    await loadPromptTemplates();
    await loadProviderModelGroups();
    await loadProfiles();
    showToast(message);
  }

  async function createProfileFromMenu() {
    const name = window.prompt("Profile name", "New Profile")?.trim();

    if (!name) return;

    applyProfileFieldsToState();

    const resp = await fetch("/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        ...getProfileValues(),
      }),
    });
    const profile = (await resp.json()) as AssistantProfile;

    await activateProfile(profile, "Profile created");
  }

  async function saveProfile(profile = currentProfile) {
    if (!profile) {
      showToast("No profile selected");
      return;
    }

    applyProfileFieldsToState();

    const resp = await fetch(`/profiles/${encodeURIComponent(profile.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getProfileValues()),
    });
    const savedProfile = (await resp.json()) as AssistantProfile;

    if (savedProfile.id === appState.activeProfileId) {
      applyProfile(savedProfile);
      syncProfileFields();
    }

    await loadProfiles();
    showToast("Profile saved");
  }

  async function saveProfileFromMenu(profile: AssistantProfile) {
    profileMenuOpen = false;
    await saveProfile(profile);
  }

  async function deleteProfile(profile: AssistantProfile) {
    profileMenuOpen = false;

    if (!window.confirm(`Delete "${profile.name}"?`)) return;

    const deletedActiveProfile = profile.id === appState.activeProfileId;
    const resp = await fetch(`/profiles/${encodeURIComponent(profile.id)}`, {
      method: "DELETE",
    });
    await resp.json();

    if (deletedActiveProfile) {
      await loadActiveProfile();
      await loadPromptTemplates();
      await loadProviderModelGroups();
    }

    await loadProfiles();
    showToast("Profile deleted");
  }

  function ensureSelectedProviderModel() {
    const selectedProvider = providerModelGroups.find(
      (provider) => provider.id === appState.currentProviderId,
    );

    if (selectedProvider?.models.includes(appState.currentModelId)) return;

    const firstProviderWithModels = providerModelGroups.find(
      (provider) => provider.models.length > 0,
    );

    if (firstProviderWithModels) {
      appState.currentProviderId = firstProviderWithModels.id;
      appState.currentModelId = firstProviderWithModels.models[0];
      return;
    }

    appState.currentProviderId = providerModelGroups[0]?.id ?? "";
    appState.currentModelId = "";
  }

  function getSelectedProviderModelLabel() {
    const provider = providerModelGroups.find(
      (item) => item.id === appState.currentProviderId,
    );

    if (provider && appState.currentModelId) {
      return `${provider.name} / ${appState.currentModelId}`;
    }

    if (appState.currentModelId) return appState.currentModelId;

    return providerModelGroups.some((item) => item.models.length > 0)
      ? "Select chat model"
      : "No models available";
  }

  async function loadProviderModelGroups() {
    const resp = await fetch("/providers?available=true", {
      method: "GET",
    });
    const providers = (await resp.json()) as ProviderOption[];

    providerModelGroups = await Promise.all(
      providers.map(async (provider) => {
        const providerId = encodeURIComponent(provider.id);
        const modelsResp = await fetch(
          `/providers/${providerId}?available=true`,
          { method: "GET" },
        );

        return {
          ...provider,
          models: (await modelsResp.json()) as string[],
        };
      }),
    );

    ensureSelectedProviderModel();
  }

  async function loadPromptTemplates() {
    const resp = await fetch("/prompt-templates", { method: "GET" });
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

    const template = (await resp.json()) as PromptTemplate;
    await loadPromptTemplates();
    appState.promptTemplateId = template.id;

    await saveActiveProfile(
      value.id ? "Prompt template updated" : "Prompt template created",
    );

    closePromptTemplatePopup();
  }

  async function selectPromptTemplate(templateId: string) {
    templateMenuOpen = false;

    if (appState.promptTemplateId === templateId) return;

    appState.promptTemplateId = templateId;
    await saveActiveProfile("Prompt template updated");
  }

  async function deletePromptTemplate(template: PromptTemplate) {
    templateMenuOpen = false;

    if (!window.confirm(`Delete "${template.name}"?`)) return;

    const resp = await fetch(
      `/prompt-templates/${encodeURIComponent(template.id)}`,
      { method: "DELETE" },
    );
    await resp.json();

    const deletedSelectedTemplate = appState.promptTemplateId === template.id;

    if (deletedSelectedTemplate) appState.promptTemplateId = "";

    await loadPromptTemplates();

    if (deletedSelectedTemplate) {
      await saveActiveProfile("Prompt template deleted");
    } else {
      showToast("Prompt template deleted");
    }
  }

  async function saveActiveProfile(message = "Active profile updated") {
    applyProfileFieldsToState();

    if (!currentProfile) return;

    const resp = await fetch("/profiles/active", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getProfileValues()),
    });
    const profile = (await resp.json()) as AssistantProfile;
    applyProfile(profile);
    syncProfileFields();
    showToast(message);
  }

  async function handleActiveProfileChange() {
    await saveActiveProfile();
  }

  async function selectProviderModel(providerId: string, modelId: string) {
    modelMenuOpen = false;

    if (!modelId) return;

    if (
      providerId === appState.currentProviderId &&
      modelId === appState.currentModelId
    ) {
      return;
    }

    appState.currentProviderId = providerId;
    appState.currentModelId = modelId;

    await saveActiveProfile("Chat model updated");
  }

  async function handleApiKeysChanged() {
    await loadProviderModelGroups();
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
      <label for="profile_select">Current Profile</label>

      <div class="assistant-profile-strip">
        <Dropdown
          id="profile_select"
          bind:open={profileMenuOpen}
          width="var(--assistant-dropdown-width)"
          maxHeight={260}
        >
          {#snippet trigger({ open, toggle, menuId })}
            <button
              id="profile_select"
              class="input profile-trigger"
              type="button"
              aria-haspopup="menu"
              aria-controls={menuId}
              aria-expanded={open}
              onclick={toggle}
            >
              <span>{currentProfile?.name ?? "No saved profile"}</span>
              <Icon name="expand_more" size={16} />
            </button>
          {/snippet}

          {#each profiles as profile (profile.id)}
            <div
              class="profile-item"
              class:selected={profile.id === appState.activeProfileId}
            >
              <button
                type="button"
                class="profile-option"
                role="menuitemradio"
                aria-checked={profile.id === appState.activeProfileId}
                onclick={() => activateProfile(profile)}
              >
                <span class="profile-name">{profile.name}</span>
              </button>

              <div class="profile-item-actions">
                <button
                  type="button"
                  class="dropdown-action-button"
                  title="Save to profile"
                  aria-label={`Save current values to ${profile.name}`}
                  onclick={() => saveProfileFromMenu(profile)}
                >
                  <Icon name="save" size={16} />
                </button>

                <button
                  type="button"
                  class="dropdown-action-button danger"
                  title="Delete profile"
                  aria-label={`Delete ${profile.name}`}
                  onclick={() => deleteProfile(profile)}
                >
                  <Icon name="delete" size={16} />
                </button>
              </div>
            </div>
          {/each}

          <button
            type="button"
            class="dropdown-create-button"
            role="menuitem"
            onclick={createProfileFromMenu}
          >
            <Icon name="add" size={16} />
            <span>New profile</span>
          </button>
        </Dropdown>

        <button
          type="button"
          class="profile-save-button"
          title="Save active profile"
          aria-label="Save active profile"
          onclick={() => saveProfile()}
        >
          <Icon name="save" size={17} />
        </button>
      </div>
    </div>

    <div class="row">
      <label for="tmpl_select">Prompt Template</label>

      <Dropdown
        id="tmpl_select"
        bind:open={templateMenuOpen}
        width="var(--assistant-dropdown-width)"
        maxHeight={260}
      >
        {#snippet trigger({ open, toggle, menuId })}
          <button
            id="tmpl_select"
            class="input prompt-template-trigger"
            type="button"
            aria-haspopup="menu"
            aria-controls={menuId}
            aria-expanded={open}
            onclick={toggle}
          >
            <span>{selectedTemplate?.name ?? "None"}</span>
            <Icon name="expand_more" size={16} />
          </button>
        {/snippet}

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
                class="dropdown-action-button"
                title="Edit prompt template"
                aria-label={`Edit ${template.name}`}
                onclick={() => openEditPromptTemplate(template)}
              >
                <Icon name="edit" size={16} />
              </button>

              <button
                type="button"
                class="dropdown-action-button danger"
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
          class="dropdown-create-button"
          role="menuitem"
          onclick={openNewPromptTemplate}
        >
          <Icon name="add" size={16} />
          <span>New prompt template</span>
        </button>
      </Dropdown>
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
            onchange={handleActiveProfileChange}
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
            onchange={handleActiveProfileChange}
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
            onchange={handleActiveProfileChange}
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
        onchange={handleActiveProfileChange}
      ></textarea>
    </div>

    <div class="row">
      <label for="assistant_llm_model">Chat Model</label>

      <Dropdown
        id="assistant_llm_model"
        bind:open={modelMenuOpen}
        width="var(--assistant-dropdown-width)"
        maxHeight={260}
      >
        {#snippet trigger({ open, toggle, menuId })}
          <button
            id="assistant_llm_model"
            class="input model-trigger"
            type="button"
            aria-haspopup="menu"
            aria-controls={menuId}
            aria-expanded={open}
            disabled={!hasProviderModels}
            onclick={toggle}
          >
            <span>{selectedProviderModelLabel}</span>
            <Icon name="expand_more" size={16} />
          </button>
        {/snippet}

        {#each providerModelGroups as provider (provider.id)}
          <div class="model-provider-section">
            <div class="model-provider-heading">{provider.name}</div>

            {#if provider.models.length}
              {#each provider.models as model (model)}
                <button
                  type="button"
                  class="model-option"
                  class:selected={provider.id === appState.currentProviderId &&
                    model === appState.currentModelId}
                  role="menuitemradio"
                  aria-checked={provider.id === appState.currentProviderId &&
                    model === appState.currentModelId}
                  onclick={() => selectProviderModel(provider.id, model)}
                >
                  <span class="model-name">{model}</span>
                </button>
              {/each}
            {:else}
              <div class="model-empty">No models available</div>
            {/if}
          </div>
        {:else}
          <div class="model-empty">No providers available</div>
        {/each}
      </Dropdown>
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
    --assistant-dropdown-width: 300px;
    --assistant-option-bg: hsl(var(--h) var(--sat) calc(var(--l-panel) + 3%));
    --assistant-option-hover-bg: hsl(
      var(--h) var(--sat) calc(var(--l-panel) + 6%)
    );
    --assistant-option-selected-bg: color-mix(
      in oklab,
      var(--accent) 30%,
      hsl(var(--h) var(--sat) calc(var(--l-panel) + 8%))
    );
    --assistant-option-selected-ring: color-mix(
      in oklab,
      var(--accent) 45%,
      transparent
    );

    display: grid;
    gap: 10px;
  }

  .assistant-profile-strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 3%));
    box-shadow: inset 0 1px 0 color-mix(in oklab, white 18%, transparent);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .assistant-profile-strip:focus-within {
    border-color: var(--accent);
    box-shadow:
      inset 0 1px 0 color-mix(in oklab, white 18%, transparent),
      0 0 0 3px color-mix(in oklab, var(--accent) 18%, transparent);
  }

  .profile-trigger {
    display: grid;
    min-width: 0;
    min-height: 38px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 0;
    border-radius: 13px 0 0 13px;
    background: transparent;
    box-shadow: none;
    text-align: left;
  }

  .profile-trigger:focus {
    box-shadow: none;
  }

  .profile-trigger span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-save-button {
    display: inline-grid;
    width: 44px;
    min-width: 44px;
    height: 40px;
    min-height: 40px;
    place-items: center;
    padding: 0;
    border: 0;
    border-left: 1px solid var(--border);
    border-radius: 0 13px 13px 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    line-height: 1;
  }

  .profile-save-button:hover {
    background: color-mix(in oklab, var(--accent) 9%, transparent);
    color: var(--text);
  }

  .profile-save-button:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid color-mix(in oklab, var(--accent) 70%, transparent);
    outline-offset: -3px;
  }

  .profile-save-button:active {
    transform: none;
  }

  .model-trigger,
  .prompt-template-trigger {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    text-align: left;
  }

  .model-trigger span,
  .prompt-template-trigger span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-provider-section {
    display: grid;
    gap: 4px;
    padding-bottom: 6px;
  }

  .model-provider-section:not(:last-child) {
    border-bottom: 1px solid
      color-mix(in oklab, var(--border) 82%, transparent);
    margin-bottom: 2px;
  }

  .model-provider-heading {
    padding: 4px 8px 2px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
  }

  .profile-item,
  .prompt-template-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    border-radius: 8px;
    background: var(--assistant-option-bg);
    overflow: hidden;
    gap: 0;
  }

  .model-option,
  .prompt-template-option,
  .dropdown-create-button {
    width: 100%;
    min-width: 0;
    min-height: 32px;
    justify-content: flex-start;
    border: 0;
    border-radius: 8px;
    background: var(--assistant-option-bg);
    text-align: left;
  }

  .profile-option {
    width: 100%;
    min-width: 0;
    min-height: 32px;
    justify-content: flex-start;
    border: 0;
    border-radius: 0;
    background: transparent;
    text-align: left;
  }

  .prompt-template-item .prompt-template-option {
    border-radius: 0;
    background: transparent;
  }

  .model-option:hover,
  .profile-item:hover,
  .prompt-template-item:hover,
  .prompt-template-option:hover,
  .dropdown-create-button:hover {
    background: var(--assistant-option-hover-bg);
  }

  .prompt-template-item .prompt-template-option:hover {
    background: transparent;
  }

  .model-option.selected,
  .profile-item.selected,
  .prompt-template-item.selected,
  .prompt-template-option.selected {
    background: var(--assistant-option-selected-bg);
    box-shadow: inset 0 0 0 1px var(--assistant-option-selected-ring);
    color: var(--text);
  }

  .model-option.selected,
  .profile-item.selected .profile-option,
  .profile-item.selected .dropdown-action-button,
  .prompt-template-item.selected .prompt-template-option,
  .prompt-template-item.selected .dropdown-action-button,
  .prompt-template-option.selected {
    color: var(--text);
  }

  .profile-name,
  .model-name,
  .prompt-template-name {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-empty {
    padding: 8px;
    border-radius: 8px;
    background: var(--assistant-option-bg);
    color: var(--muted);
    font-size: 12px;
  }

  .profile-item-actions {
    display: inline-flex;
    align-self: stretch;
    gap: 0;
  }

  .profile-empty {
    padding: 8px;
    color: var(--muted);
    font-size: 12px;
  }

  .dropdown-create-button {
    display: inline-flex;
    gap: 8px;
    color: var(--muted);
  }

  .dropdown-create-button:hover {
    color: var(--text);
  }

  .dropdown-action-button {
    display: inline-grid;
    width: 34px;
    min-width: 34px;
    height: 32px;
    min-height: 32px;
    place-items: center;
    padding: 0;
    border: 0;
    border-left: 1px solid color-mix(in oklab, var(--border) 78%, transparent);
    border-radius: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    line-height: 1;
  }

  .dropdown-action-button:hover {
    background: color-mix(in oklab, var(--accent) 9%, transparent);
    color: var(--text);
  }

  .dropdown-action-button.danger:hover {
    background: color-mix(in oklab, var(--danger-but) 55%, transparent);
    color: var(--danger-bor);
  }

  .dropdown-action-button:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid color-mix(in oklab, var(--accent) 70%, transparent);
    outline-offset: -3px;
  }

  .dropdown-action-button:active {
    transform: none;
  }

  .prompt-template-item-actions {
    display: inline-flex;
    align-self: stretch;
    gap: 0;
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

    .assistant-profile-strip {
      grid-template-columns: minmax(0, 1fr) auto;
    }

  }
</style>
