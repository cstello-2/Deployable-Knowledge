<script lang="ts">
	import FilePlus2 from '@lucide/svelte/icons/file-plus-2';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { ActionIcon } from '$lib/components/app/actions';
	import { DialogConfirmation, DialogPromptTemplate } from '$lib/components/app/dialogs';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { settingsStore } from '$lib/stores';
	import type { ApiPromptTemplateRequest, PromptTemplate } from '$lib/types';

	let editorOpen = $state(false);
	let deleteOpen = $state(false);
	let editing = $state<PromptTemplate | null>(null);

	const selected = $derived(
		settingsStore.promptTemplates.find(({ id }) => id === settingsStore.config.promptTemplateId) ??
			null
	);

	function select(id: string): void {
		settingsStore.updateConfig({ promptTemplateId: id || null });
	}

	async function save(value: ApiPromptTemplateRequest): Promise<void> {
		try {
			await settingsStore.savePromptTemplate(editing?.id, value);
			editorOpen = false;
			toast.success('Prompt template saved');
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function remove(): Promise<void> {
		if (!selected) return;
		try {
			await settingsStore.deletePromptTemplate(selected.id);
			toast.success('Prompt template deleted');
		} catch (error) {
			toast.error(message(error));
		}
	}

	function message(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
</script>

<section class="grid gap-2">
	<div class="flex min-h-7 items-center">
		<Label for="settings-prompt-template">Prompt template</Label>
	</div>
	<div class="flex gap-2">
		<Select.Root
			type="single"
			value={settingsStore.config.promptTemplateId ?? ''}
			onValueChange={select}
		>
			<Select.Trigger id="settings-prompt-template" class="min-w-0 flex-1">
				<span class="truncate">{selected?.name ?? 'Default prompt'}</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="" label="Default prompt" />
				{#each settingsStore.promptTemplates as template (template.id)}
					<Select.Item value={template.id} label={template.name} />
				{/each}
			</Select.Content>
		</Select.Root>
		<ActionIcon
			variant="outline"
			label="Edit prompt template"
			disabled={!selected}
			onclick={() => {
				editing = selected;
				editorOpen = true;
			}}><Pencil /></ActionIcon
		>
		<ActionIcon
			variant="outline"
			label="Delete prompt template"
			disabled={!selected}
			onclick={() => (deleteOpen = true)}><Trash2 /></ActionIcon
		>
		<ActionIcon
			variant="outline"
			label="New prompt template"
			onclick={() => {
				editing = null;
				editorOpen = true;
			}}><FilePlus2 /></ActionIcon
		>
	</div>
</section>

<DialogPromptTemplate
	open={editorOpen}
	template={editing}
	onOpenChange={(open) => (editorOpen = open)}
	onSave={save}
/>
<DialogConfirmation
	open={deleteOpen}
	description={`Delete “${selected?.name ?? 'this template'}”?`}
	confirmLabel="Delete template"
	onOpenChange={(open) => (deleteOpen = open)}
	onConfirm={remove}
/>
