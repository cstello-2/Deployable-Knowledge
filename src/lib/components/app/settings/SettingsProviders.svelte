<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plug from '@lucide/svelte/icons/plug';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { ActionIcon } from '$lib/components/app/actions';
	import {
		CUSTOM_PROVIDER_TYPE_OPTIONS,
		DialogConfirmation,
		DialogProvider
	} from '$lib/components/app/dialogs';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import type { CustomProviderType } from '$lib/constants';
	import { settingsStore } from '$lib/stores';
	import type { ApiCustomProviderInfo, ApiCustomProviderRequest } from '$lib/types';
	import SettingsFieldGroup from './SettingsFieldGroup.svelte';

	let editorOpen = $state(false);
	let editing = $state<ApiCustomProviderInfo | null>(null);
	let pendingRemoval = $state<ApiCustomProviderInfo | null>(null);

	const providers = $derived(
		settingsStore.providerModelGroups.flatMap(({ custom, ...group }) =>
			custom ? [{ ...group, custom }] : []
		)
	);

	function openEditor(provider: ApiCustomProviderInfo | null): void {
		editing = provider;
		editorOpen = true;
	}

	function modelSummary(count: number): string {
		if (!count) return 'No models found';
		return count === 1 ? '1 model' : `${count} models`;
	}

	async function save(type: CustomProviderType, value: ApiCustomProviderRequest): Promise<void> {
		try {
			if (editing) await settingsStore.updateProvider(editing.id, value);
			else await settingsStore.addProvider({ ...value, type });
			editorOpen = false;
			toast.success(editing ? 'Provider saved' : 'Provider added');
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function remove(): Promise<void> {
		const provider = pendingRemoval;
		pendingRemoval = null;
		if (!provider) return;
		try {
			await settingsStore.removeProvider(provider.id);
			toast.success('Provider removed');
		} catch (error) {
			toast.error(message(error));
		}
	}

	function message(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
</script>

<SettingsFieldGroup
	icon={Plug}
	title="Providers"
	hint="Connect OpenAI-compatible APIs to use their models in the agent model picker."
>
	{#if providers.length}
		<ul class="m-0 grid list-none gap-2 p-0">
			{#each providers as provider (provider.id)}
				{@const kind = CUSTOM_PROVIDER_TYPE_OPTIONS[provider.custom.type]}
				<li class="flex items-center gap-3 rounded-xl border bg-card/50 p-3">
					<span
						class="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background"
					>
						<kind.icon class="size-5 text-muted-foreground" />
					</span>
					<div class="grid min-w-0 flex-1 gap-0.5">
						<span class="flex min-w-0 items-center gap-2 text-sm font-semibold">
							<span class="truncate">{provider.name}</span>
							{#if provider.id === settingsStore.config.provider}
								<Badge variant="tertiary">Active</Badge>
							{/if}
						</span>
						<span class="truncate text-xs text-muted-foreground">{provider.custom.baseUrl}</span>
						<span class="text-xs text-muted-foreground">
							{kind.label} · {provider.custom.hasApiKey ? 'API key saved' : 'No API key'} · {modelSummary(
								provider.models.length
							)}
						</span>
					</div>
					<ActionIcon label={`Edit ${provider.name}`} onclick={() => openEditor(provider)}>
						<Pencil />
					</ActionIcon>
					<ActionIcon label={`Remove ${provider.name}`} onclick={() => (pendingRemoval = provider)}>
						<Trash2 />
					</ActionIcon>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="m-0 text-sm text-muted-foreground">No providers added yet.</p>
	{/if}
	<Button class="w-fit" onclick={() => openEditor(null)} variant="outline">
		<Plus /> Add provider
	</Button>
</SettingsFieldGroup>

<DialogProvider
	onOpenChange={(open) => (editorOpen = open)}
	onSave={save}
	open={editorOpen}
	provider={editing}
/>
<DialogConfirmation
	confirmLabel="Remove"
	description={`${pendingRemoval?.name ?? 'This provider'} and its saved API key will be removed. Profiles that use its models will need another model.`}
	onConfirm={remove}
	onOpenChange={(open) => !open && (pendingRemoval = null)}
	open={pendingRemoval !== null}
	title="Remove provider?"
/>
