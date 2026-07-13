<script lang="ts">
  import Popup from "$lib/components/popups/Popup.svelte";
  import type {
    PromptTemplate,
    PromptTemplateFormValue,
  } from "$lib/server/database/schema";

  type Props = {
    open: boolean;
    template?: PromptTemplate | null;
    onClose: () => void;
    onSave: (value: PromptTemplateFormValue) => Promise<void> | void;
  };

  let { open, template = null, onClose, onSave }: Props = $props();
  let name = $state("");
  let description = $state("");
  let systemPrompt = $state("");
  let errorMessage = $state("");

  $effect(() => {
    if (!open) return;

    name = template?.name ?? "";
    description = template?.description ?? "";
    systemPrompt = template?.systemPrompt ?? "";
    errorMessage = "";
  });

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      errorMessage = "Name is required";
      return;
    }

    await onSave({
      id: template?.id,
      name: trimmedName,
      description,
      systemPrompt,
    });
  }
</script>

<Popup
  {open}
  title={template ? "Edit Prompt Template" : "New Prompt Template"}
  id="prompt-template-editor"
  contentLabel="Prompt template editor"
  width="680px"
  {onClose}
>
  <form class="prompt-template-form" onsubmit={handleSubmit}>
    <div class="row">
      <label for="prompt_template_name">Name</label>
      <input
        id="prompt_template_name"
        class="input"
        type="text"
        placeholder="Example: Technical Helper"
        bind:value={name}
      />
    </div>

    <div class="row">
      <label for="prompt_template_description">Description</label>
      <textarea
        id="prompt_template_description"
        class="textarea"
        placeholder="Short description"
        bind:value={description}
      ></textarea>
    </div>

    <div class="row">
      <label for="prompt_template_system">System Prompt</label>
      <textarea
        id="prompt_template_system"
        class="textarea system-prompt-input"
        placeholder="System instructions for the assistant"
        bind:value={systemPrompt}
      ></textarea>
    </div>

    {#if errorMessage}
      <div class="prompt-template-error" role="alert">{errorMessage}</div>
    {/if}

    <div class="actions">
      <button class="btn" type="button" onclick={onClose}> Cancel </button>
      <button class="btn prompt-template-save" type="submit"> Save </button>
    </div>
  </form>
</Popup>

<style>
  .prompt-template-form {
    display: grid;
    gap: 12px;
  }

  .row {
    display: grid;
    gap: 8px;
  }

  label {
    color: var(--muted);
    font-size: 12px;
  }

  .system-prompt-input {
    min-height: 190px;
  }

  .prompt-template-error {
    color: var(--danger-bor);
    font-size: 12px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .prompt-template-save {
    border-color: color-mix(in oklab, var(--accent) 70%, var(--border));
    background: color-mix(
      in oklab,
      var(--accent) 46%,
      hsl(var(--h) var(--sat) var(--l-panel))
    );
    color: var(--text);
    font-weight: 600;
  }

  .prompt-template-save:hover {
    background: color-mix(
      in oklab,
      var(--accent) 58%,
      hsl(var(--h) var(--sat) var(--l-panel))
    );
  }
</style>
