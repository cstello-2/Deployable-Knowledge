<script lang="ts">
  import { getContext, onMount } from "svelte";

  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  // import { AssistantApiKeyPopup } from "$lib/components/popups";
  import type { WindowInstanceProps } from "./index.ts";
  import type { AppState } from "$lib/state.svelte";
  import type { Provider } from "$lib/server/providers/provider";
  import type { UserSettings } from "$lib/server/database/schema";

  type ProviderOption = Pick<Provider, "id" | "name">;

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
  let toastMessage = $state("");

  onMount(() => {
    initialize();
  });

  async function initialize() {
    await loadSettings();
    await loadProviders();
    await loadModels();
  }

  function syncSettingsFields() {
    temperature = appState.temperature;
    topK = appState.topK;
    maxTokens = appState.maxTokens;
    persona = appState.persona;
  }

  function showToast(message: string) {
    toastMessage = message;

    window.setTimeout(() => {
      if (toastMessage === message) toastMessage = "";
    }, 2000);
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
    const resp = await fetch("/providers", {
      method: "GET",
    });

    providers = (await resp.json()) as ProviderOption[];
  }

  async function loadModels() {
    const providerId = encodeURIComponent(appState.currentProviderId);
    const resp = await fetch(`/providers/${providerId}`, { method: "GET" });

    models = (await resp.json()) as string[];

    if (models.length && !models.includes(appState.currentModelId)) {
      appState.currentModelId = models[0];
    }
  }

  async function saveRuntimeSettings() {
    appState.temperature = temperature ?? 0.2;
    appState.topK = topK ?? 8;
    appState.maxTokens = maxTokens ?? 512;
    appState.persona = persona;

    const resp = await fetch("/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appState.settings),
    });

    const settings = (await resp.json()) as UserSettings;
    appState.applySettings(settings);
    syncSettingsFields();
    showToast("Assistant settings updated");
  }

  async function handleProviderChange() {
    await loadModels();
    await saveRuntimeSettings();
  }

  async function handleModelChange() {
    await saveRuntimeSettings();
  }
</script>

{#snippet sectionLabel(text: string)}
  <div class="field-label">{text}</div>
{/snippet}

<!-- {#snippet profileActionButton(action: string, label: string)} -->
<!--   <button -->
<!--     type="button" -->
<!--     class:active={profileAction === action} -->
<!--     class="btn" -->
<!--     id={`profile_${action}_btn`} -->
<!--     data-profile-action={action} -->
<!--     onclick={() => selectProfileAction(action)} -->
<!--   > -->
<!--     {label} -->
<!--   </button> -->
<!-- {/snippet} -->
<!---->
<!-- {#snippet personaActionButton(action: string, label: string)} -->
<!--   <button -->
<!--     type="button" -->
<!--     class:active={personaAction === action} -->
<!--     class="btn" -->
<!--     id={`persona_${action}_btn`} -->
<!--     data-persona-action={action} -->
<!--     onclick={() => selectPersonaAction(action)} -->
<!--   > -->
<!--     {label} -->
<!--   </button> -->
<!-- {/snippet} -->

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
      {@render sectionLabel("Profiles")}

      <div
        class="assistant-action-buttons"
        style="display: flex; gap: 6px; justify-content: flex-start; align-items: center; flex-wrap: wrap;"
      >
        <!-- {@render profileActionButton("create", "Create Profile")}
        {@render profileActionButton("load", "Load Profile")}
        {@render profileActionButton("delete", "Delete Profile")}
        -->
      </div>
    </div>

    <!-- {#if showProfileCreate} -->
    <!--   <div class="row" id="profile_create_row"> -->
    <!--     <label for="profile_name">Profile Name</label> -->
    <!--     <input -->
    <!--       id="profile_name" -->
    <!--       class="input" -->
    <!--       type="text" -->
    <!--       placeholder="Example: Research Mode" -->
    <!--       bind:value={profileName} -->
    <!--     /> -->
    <!--   </div> -->
    <!-- {/if} -->

    <!-- {#if showProfileSelect} -->
    <!--   <div class="row" id="profile_select_row"> -->
    <!--     <label for="profile_select">Saved Profile</label> -->
    <!--     <select -->
    <!--       id="profile_select" -->
    <!--       class="input" -->
    <!--       bind:value={selectedProfileId} -->
    <!--       disabled={!profiles.length} -->
    <!--     > -->
    <!--       {#if profiles.length} -->
    <!--         <option value="">Select a profile</option> -->
    <!---->
    <!--         {#each profiles as profile (profile.id)} -->
    <!--           <option value={profile.id}>{profile.name || profile.id}</option> -->
    <!--         {/each} -->
    <!--       {:else} -->
    <!--         <option value="">No saved profiles</option> -->
    <!--       {/if} -->
    <!--     </select> -->
    <!--   </div> -->
    <!-- {/if} -->

    <!-- {#if showProfileActions || showProfileSaveEdits} -->
    <!--   <div class="row" id="profile_actions"> -->
    <!--     {#if showProfileConfirm} -->
    <!--       <button -->
    <!--         type="button" -->
    <!--         class="btn" -->
    <!--         id="profile_confirm" -->
    <!--         onclick={confirmProfileAction} -->
    <!--       > -->
    <!--         Confirm -->
    <!--       </button> -->
    <!--     {/if} -->
    <!---->
    <!--     {#if showProfileSave} -->
    <!--       <button -->
    <!--         type="button" -->
    <!--         class="btn" -->
    <!--         id="profile_save" -->
    <!--         onclick={saveCurrentProfile} -->
    <!--       > -->
    <!--         Save Profile -->
    <!--       </button> -->
    <!--     {/if} -->
    <!---->
    <!--     {#if showProfileSaveEdits} -->
    <!--       <button -->
    <!--         type="button" -->
    <!--         class="btn" -->
    <!--         id="profile_save_edits" -->
    <!--         onclick={saveLoadedProfileEdits} -->
    <!--       > -->
    <!--         Save Edits -->
    <!--       </button> -->
    <!--     {/if} -->
    <!--   </div> -->
    <!-- {/if} -->

    <div class="row">
      <label for="tmpl_select">Prompt Template</label>

      <div style="display: flex; gap: 6px; align-items: center;">
        <!-- <select -->
        <!--   id="tmpl_select" -->
        <!--   class="input" -->
        <!--   style="flex: 1;" -->
        <!--   bind:value={templateSelect} -->
        <!--   onchange={() => loadTemplate(templateSelect)} -->
        <!-- > -->
        <!--   <option value={NONE_VALUE}>None</option> -->
        <!---->
        <!--   {#each templates as template (template.id)} -->
        <!--     <option value={template.id}>{template.name || template.id}</option> -->
        <!--   {/each} -->
        <!---->
        <!--   <option value={CREATE_NEW_VALUE}>Create Your Own</option> -->
        <!-- </select> -->

        <!-- {#if deleteTemplateVisible} -->
        <!--   <button -->
        <!--     type="button" -->
        <!--     class="btn" -->
        <!--     id="tmpl_delete" -->
        <!--     title="Delete selected user-made prompt template" -->
        <!--     onclick={deleteSelectedTemplate} -->
        <!--   > -->
        <!--     Delete Template -->
        <!--   </button> -->
        <!-- {/if} -->
      </div>
    </div>

    <!-- {#if promptDetailsVisible} -->
    <!--   {#key templateSelect} -->
    <!--     <div id="tmpl_details"> -->
    <!--       <div class="row"> -->
    <!--         <label for="tmpl_name">Name</label> -->
    <!--         <input -->
    <!--           id="tmpl_name" -->
    <!--           class="input" -->
    <!--           type="text" -->
    <!--           placeholder="Example: Technical Helper" -->
    <!--           bind:value={templateName} -->
    <!--           disabled={!promptCanEdit} -->
    <!--           readonly={!promptCanEdit} -->
    <!--         /> -->
    <!--       </div> -->
    <!---->
    <!--       <div class="row"> -->
    <!--         <label for="tmpl_description">Description</label> -->
    <!--         <textarea -->
    <!--           id="tmpl_description" -->
    <!--           class="textarea" -->
    <!--           placeholder="Short description of what this prompt does." -->
    <!--           style="min-height: 70px;" -->
    <!--           bind:value={templateDescription} -->
    <!--           disabled={!promptCanEdit} -->
    <!--           readonly={!promptCanEdit} -->
    <!--         ></textarea> -->
    <!--       </div> -->
    <!---->
    <!--       <div class="row"> -->
    <!--         <label for="tmpl_system">System</label> -->
    <!--         <textarea -->
    <!--           id="tmpl_system" -->
    <!--           class="textarea" -->
    <!--           placeholder="System instructions for the assistant." -->
    <!--           style="min-height: 130px;" -->
    <!--           bind:value={templateSystem} -->
    <!--           disabled={!promptCanEdit} -->
    <!--           readonly={!promptCanEdit} -->
    <!--         ></textarea> -->
    <!--       </div> -->
    <!--     </div> -->
    <!--   {/key} -->
    <!-- {/if} -->

    <div class="row">
      {@render sectionLabel("Personas")}

      <div
        class="assistant-action-buttons"
        style="display: flex; gap: 6px; justify-content: flex-start; align-items: center; flex-wrap: wrap;"
      >
        <!-- {@render personaActionButton("create", "Create Persona")} -->
        <!-- {@render personaActionButton("load", "Load Persona")} -->
        <!-- {@render personaActionButton("delete", "Delete Persona")} -->
      </div>
    </div>

    <!-- {#if showPersonaSelect} -->
    <!--   <div class="row" id="persona_select_row"> -->
    <!--     <label for="persona_select">Saved Persona</label> -->
    <!--     <select -->
    <!--       id="persona_select" -->
    <!--       class="input" -->
    <!--       bind:value={selectedPersonaId} -->
    <!--       disabled={!personas.length} -->
    <!--     > -->
    <!--       {#if personas.length} -->
    <!--         <option value="">Select a persona</option> -->
    <!---->
    <!--         {#each personas as persona (persona.id)} -->
    <!--           <option value={persona.id}>{persona.name || persona.id}</option> -->
    <!--         {/each} -->
    <!--       {:else} -->
    <!--         <option value="">No saved personas</option> -->
    <!--       {/if} -->
    <!--     </select> -->
    <!--   </div> -->
    <!-- {/if} -->

    <!-- {#if showPersonaConfirm} -->
    <!--   <div class="row" id="persona_confirm_row"> -->
    <!--     <button -->
    <!--       type="button" -->
    <!--       class="btn" -->
    <!--       id="persona_confirm" -->
    <!--       onclick={confirmPersonaAction} -->
    <!--     > -->
    <!--       Confirm -->
    <!--     </button> -->
    <!--   </div> -->
    <!-- {/if} -->

    <!-- {#if showPersonaEditor} -->
    <!--   {#key loadedPersonaId || personaAction} -->
    <!--     <div id="persona_editor"> -->
    <!--       <div class="row"> -->
    <!--         <label for="persona_name">Persona Name</label> -->
    <!--         <input -->
    <!--           id="persona_name" -->
    <!--           class="input" -->
    <!--           type="text" -->
    <!--           placeholder="Example: Engineering Tutor" -->
    <!--           bind:value={personaName} -->
    <!--         /> -->
    <!--       </div> -->
    <!---->
    <!--       <div class="row"> -->
    <!--         <label for="assistant_persona">Persona</label> -->
    <!--         <textarea -->
    <!--           id="assistant_persona" -->
    <!--           class="textarea" -->
    <!--           placeholder="Write the persona instructions here." -->
    <!--           style="min-height: 90px;" -->
    <!--           bind:value={personaText} -->
    <!--         ></textarea> -->
    <!--       </div> -->
    <!---->
    <!--       <div class="row"> -->
    <!--         <button -->
    <!--           type="button" -->
    <!--           class="btn" -->
    <!--           id="persona_save" -->
    <!--           onclick={savePersona} -->
    <!--         > -->
    <!--           {#if loadedPersonaId} -->
    <!--             Save Persona Edits -->
    <!--           {:else} -->
    <!--             Save Persona -->
    <!--           {/if} -->
    <!--         </button> -->
    <!--       </div> -->
    <!--     </div> -->
    <!--   {/key} -->
    <!-- {/if} -->

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
            onchange={saveRuntimeSettings}
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
            onchange={saveRuntimeSettings}
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
            onchange={saveRuntimeSettings}
          />
        </div>
      </div>

      <div
        class="assistant-manage-buttons"
        style="display: flex; align-items: end; gap: 6px; margin-left: auto;"
      >
        <!-- <button -->
        <!--   type="button" -->
        <!--   class="btn" -->
        <!--   id="manage_mcps" -->
        <!--   onclick={() => showToast("MCP manager coming soon")} -->
        <!-- > -->
        <!--   Manage MCP's -->
        <!-- </button>  -->

        <!-- <button -->
        <!--   type="button" -->
        <!--   class="btn" -->
        <!--   id="manage_api_keys" -->
        <!--   onclick={openApiKeyManager} -->
        <!-- > -->
        <!--   Manage API Keys -->
        <!-- </button> -->
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
        onchange={saveRuntimeSettings}
      ></textarea>
    </div>

    <!-- {#if saveTemplateVisible} -->
    <!--   <div class="row"> -->
    <!--     <button type="button" class="btn" id="tmpl_save" onclick={saveTemplate}> -->
    <!--       {saveTemplateLabel} -->
    <!--     </button> -->
    <!--   </div> -->
    <!-- {/if} -->

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

  {#if toastMessage}
    <div class="toast show">{toastMessage}</div>
  {/if}
</BaseWindow>

<!-- <AssistantApiKeyPopup -->
<!--   open={apiKeyManagerOpen} -->
<!--   onClose={() => (apiKeyManagerOpen = false)} -->
<!--   onChanged={loadRuntimeSettings} -->
<!--   onToast={showToast} -->
<!-- /> -->

<style>
  .assistant-action-buttons .active {
    outline: 1px solid var(--accent);
  }

  .assistant-settings-form {
    display: grid;
    gap: 10px;
  }

  .field-label {
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }

  .assistant-compact-field {
    display: grid;
    gap: 4px;
  }

  .assistant-compact-field label {
    font-size: 12px;
  }

  .toast {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 10000;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--text);
    padding: 8px 12px;
    opacity: 0;
    transform: translateY(8px);
    transition:
      opacity 120ms ease,
      transform 120ms ease;
  }

  .toast.show {
    opacity: 1;
    transform: translateY(0);
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
  }
</style>
