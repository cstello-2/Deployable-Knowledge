<script lang="ts">
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Save from '@lucide/svelte/icons/save';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { ActionIcon } from '$lib/components/app/actions';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { ProvidersService } from '$lib/services';
	import type { ApiProviderInfo } from '$lib/types';

	const MASKED_API_KEY = '••••••••••••••••';

	interface Props {
		onChanged?: () => Promise<void> | void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
	}

	let { onChanged = () => {}, onOpenChange, open }: Props = $props();
	let providers = $state<ApiProviderInfo[]>([]);
	let apiKeys = $state<Record<string, string>>({});
	let loading = $state(false);

	$effect(() => {
		if (open) void loadProviders();
	});

	async function loadProviders(): Promise<void> {
		loading = true;
		try {
			providers = await ProvidersService.list();
			apiKeys = {};
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to load providers');
		} finally {
			loading = false;
		}
	}

	async function save(provider: ApiProviderInfo): Promise<void> {
		const apiKey = (apiKeys[provider.id] ?? '').trim();
		if (!apiKey) {
			toast.info(provider.hasApiKey ? 'API key already saved' : 'Enter an API key to save');
			return;
		}
		try {
			await ProvidersService.saveApiKey(provider.id, apiKey);
			await onChanged();
			await loadProviders();
			toast.success('API key saved');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save API key');
		}
	}

	async function clear(provider: ApiProviderInfo): Promise<void> {
		try {
			await ProvidersService.deleteApiKey(provider.id);
			await onChanged();
			await loadProviders();
			toast.success('API key cleared');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to clear API key');
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2"><KeyRound /> API keys</Dialog.Title>
			<Dialog.Description>Manage credentials for configured model providers.</Dialog.Description>
		</Dialog.Header>

		<div class="grid max-h-[60vh] gap-3 overflow-y-auto">
			{#if loading}
				<p class="text-sm text-muted-foreground">Loading providers…</p>
			{:else}
				{#each providers as provider (provider.id)}
					<div
						class="dk-panel grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(8rem,1fr)_minmax(14rem,2fr)] sm:items-center"
					>
						<div>
							<p class="font-medium">{provider.name}</p>
							<p class="text-xs text-muted-foreground">
								{provider.apiKeyRequired
									? provider.hasApiKey
										? 'API key saved'
										: 'API key required'
									: 'Local provider'}
							</p>
						</div>
						{#if provider.apiKeyRequired}
							<div class="flex min-w-0 gap-2">
								<Input
									type="password"
									autocomplete="off"
									placeholder="API key"
									value={apiKeys[provider.id] ?? (provider.hasApiKey ? MASKED_API_KEY : '')}
									onfocus={() => {
										if (provider.hasApiKey && apiKeys[provider.id] == null) {
											apiKeys = { ...apiKeys, [provider.id]: '' };
										}
									}}
									oninput={(event) =>
										(apiKeys = { ...apiKeys, [provider.id]: event.currentTarget.value })}
								/>
								<ActionIcon label="Save API key" onclick={() => save(provider)}><Save /></ActionIcon
								>
								<ActionIcon
									variant="destructive"
									label="Clear API key"
									onclick={() => clear(provider)}><Trash2 /></ActionIcon
								>
							</div>
						{/if}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">No providers found.</p>
				{/each}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
