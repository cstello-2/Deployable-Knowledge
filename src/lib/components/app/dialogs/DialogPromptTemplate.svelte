<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { ApiPromptTemplateRequest, PromptTemplate } from '$lib/types';
	import { PROMPT_TEMPLATE_PRESETS } from './prompt-template-presets';

	interface Props {
		onOpenChange: (open: boolean) => void;
		onSave: (value: ApiPromptTemplateRequest) => Promise<void> | void;
		open: boolean;
		template?: PromptTemplate | null;
	}

	let { onOpenChange, onSave, open, template = null }: Props = $props();
	let name = $state('');
	let description = $state('');
	let systemPrompt = $state('');

	$effect(() => {
		if (!open) return;
		name = template?.name ?? '';
		description = template?.description ?? '';
		systemPrompt = template?.systemPrompt ?? '';
	});

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		await onSave({ name: name.trim(), description: description.trim(), systemPrompt });
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-xl">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>{template ? 'Edit prompt template' : 'New prompt template'}</Dialog.Title>
				<Dialog.Description
					>Save reusable instructions for document-grounded chat.</Dialog.Description
				>
			</Dialog.Header>

			{#if !template}
				<div class="flex flex-wrap gap-2">
					{#each PROMPT_TEMPLATE_PRESETS as preset (preset.id)}
						<Button
							variant="outline"
							size="sm"
							onclick={() => {
								name = preset.name;
								description = preset.description;
								systemPrompt = preset.systemPrompt;
							}}
						>
							{preset.name}
						</Button>
					{/each}
				</div>
			{/if}

			<div class="grid gap-2">
				<Label for="prompt-name">Name</Label><Input id="prompt-name" bind:value={name} required />
			</div>
			<div class="grid gap-2">
				<Label for="prompt-description">Description</Label><Input
					id="prompt-description"
					bind:value={description}
				/>
			</div>
			<div class="grid gap-2">
				<Label for="prompt-system">System prompt</Label><Textarea
					id="prompt-system"
					class="min-h-44"
					bind:value={systemPrompt}
					required
				/>
			</div>

			<Dialog.Footer>
				<Button variant="outline" onclick={() => onOpenChange(false)}>Cancel</Button>
				<Button type="submit">Save template</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
