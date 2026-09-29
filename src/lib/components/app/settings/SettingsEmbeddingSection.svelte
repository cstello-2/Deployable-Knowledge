<script lang="ts">
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ScanSearch from '@lucide/svelte/icons/scan-search';
	import { onMount } from 'svelte';
	import { ActionIcon } from '$lib/components/app/actions';
	import { DialogConfirmation } from '$lib/components/app/dialogs';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		EMBEDDING_DEVICES,
		LOCAL_EMBEDDING_MODELS,
		LOCAL_MODEL_PROVIDER_ID,
		type EmbeddingDevice
	} from '$lib/constants';
	import { embeddingStore } from '$lib/stores';
	import type { ApiEmbeddingStatus, EmbeddingBackend, EmbeddingSettings } from '$lib/types';
	import { catalogModelCard } from './local-model-catalog';
	import SettingsFieldGroup from './SettingsFieldGroup.svelte';
	import SettingsModelCard from './SettingsModelCard.svelte';

	const DEVICE_LABELS: Record<EmbeddingDevice, string> = {
		auto: 'Auto',
		cpu: 'CPU',
		gpu: 'GPU'
	};

	const BACKEND_LABELS: Record<EmbeddingBackend, string> = {
		cpu: 'the CPU',
		cuda: 'CUDA',
		vulkan: 'Vulkan',
		metal: 'Metal'
	};

	const cards = LOCAL_EMBEDDING_MODELS.map((model) => catalogModelCard(model, null));

	let draftProvider = $state<string | null>(null);
	let pendingDelete = $state<string | null>(null);
	let pendingSwitch = $state<Pick<EmbeddingSettings, 'provider' | 'model'> | null>(null);

	const status = $derived(embeddingStore.status);
	const providerId = $derived(
		draftProvider ?? status?.settings.provider ?? LOCAL_MODEL_PROVIDER_ID
	);
	const isLocal = $derived(providerId === LOCAL_MODEL_PROVIDER_ID);
	const selectedModel = $derived(
		status?.settings.provider === providerId ? status.settings.model : ''
	);
	const modelOptions = $derived(
		isLocal
			? LOCAL_EMBEDDING_MODELS.map(({ fileName, name }) => ({ value: fileName, label: name }))
			: embeddingStore.remoteModels.map((model) => ({ value: model, label: model }))
	);
	const modelLabel = $derived(
		modelOptions.find(({ value }) => value === selectedModel)?.label ?? selectedModel
	);
	const switchLabel = $derived(
		LOCAL_EMBEDDING_MODELS.find(({ fileName }) => fileName === pendingSwitch?.model)?.name ??
			pendingSwitch?.model
	);

	function providerName(current: ApiEmbeddingStatus, id: string): string {
		return current.providers.find((provider) => provider.id === id)?.name ?? id;
	}

	function runtimeLine(current: ApiEmbeddingStatus): string {
		if (current.backend) return `Running on ${BACKEND_LABELS[current.backend]}.`;
		if (current.settings.provider === LOCAL_MODEL_PROVIDER_ID) return 'Loads on first use.';
		return `Embeds through ${providerName(current, current.settings.provider)}.`;
	}

	function statusLine(current: ApiEmbeddingStatus): string {
		if (!current.ready) return 'The model has not been downloaded yet.';
		if (current.pendingChunks === 0) return runtimeLine(current);
		return `${runtimeLine(current)} ${current.pendingChunks.toLocaleString()} chunks waiting to be re-embedded.`;
	}

	function requestSwitch(provider: string, model: string): void {
		if (status?.settings.provider === provider && status.settings.model === model) return;
		pendingSwitch = { provider, model };
	}

	async function confirmSwitch(): Promise<void> {
		if (!pendingSwitch) return;
		await embeddingStore.update(pendingSwitch);
		draftProvider = null;
		pendingSwitch = null;
	}

	function selectProvider(id: string): void {
		if (id !== LOCAL_MODEL_PROVIDER_ID) {
			draftProvider = id;
			return;
		}
		draftProvider = null;
		requestSwitch(id, LOCAL_EMBEDDING_MODELS[0].fileName);
	}

	$effect(() => {
		if (!isLocal) void embeddingStore.loadRemoteModels(providerId);
	});

	onMount(() => void embeddingStore.refresh());
</script>

{#if status}
	<div class="grid gap-6">
		<SettingsFieldGroup
			icon={ScanSearch}
			title="Embedding model"
			hint="Changing the model re-embeds existing documents in the background. OpenAI-compatible providers added under Models can serve embeddings too."
		>
			<div class="grid items-start gap-4 @2xl:grid-cols-2">
				<div class="grid gap-2">
					<Label for="settings-embedding-provider">Provider</Label>
					<Select.Root
						disabled={embeddingStore.saving}
						onValueChange={selectProvider}
						type="single"
						value={providerId}
					>
						<Select.Trigger class="w-full" id="settings-embedding-provider">
							<span class="truncate">{providerName(status, providerId)}</span>
						</Select.Trigger>
						<Select.Content>
							{#each status.providers as provider (provider.id)}
								<Select.Item label={provider.name} value={provider.id} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="grid gap-2">
					<Label for="settings-embedding-model">Model</Label>
					<Select.Root
						disabled={embeddingStore.saving || modelOptions.length === 0}
						onValueChange={(model) => requestSwitch(providerId, model)}
						type="single"
						value={selectedModel}
					>
						<Select.Trigger class="w-full" id="settings-embedding-model">
							<span class="truncate">{modelLabel || 'Choose a model'}</span>
						</Select.Trigger>
						<Select.Content>
							{#each modelOptions as option (option.value)}
								<Select.Item label={option.label} value={option.value} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			{#if isLocal}
				<div class="grid gap-2">
					<Label>Compute device</Label>
					<ButtonGroup.Root aria-label="Embedding compute device" class="w-fit">
						{#each EMBEDDING_DEVICES as device (device)}
							<Button
								aria-pressed={status.settings.device === device}
								disabled={embeddingStore.saving}
								onclick={() => void embeddingStore.update({ device })}
								size="sm"
								variant={status.settings.device === device ? 'default' : 'outline'}
							>
								{DEVICE_LABELS[device]}
							</Button>
						{/each}
					</ButtonGroup.Root>
				</div>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<p class="m-0 text-xs text-muted-foreground" aria-live="polite">{statusLine(status)}</p>
				<ActionIcon
					class="size-7"
					label="Refresh embedding status"
					onclick={() => void embeddingStore.refresh()}
				>
					<RefreshCw />
				</ActionIcon>
			</div>

			{#if embeddingStore.error && !embeddingStore.setupOpen}
				<p class="m-0 text-sm text-destructive">{embeddingStore.error}</p>
			{/if}
		</SettingsFieldGroup>

		<SettingsFieldGroup
			icon={HardDrive}
			title="Local embedding models"
			hint="Run in-app via llama.cpp, fully offline."
		>
			<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{#each cards as card (card.fileName)}
					{@const active =
						status.settings.provider === LOCAL_MODEL_PROVIDER_ID &&
						status.settings.model === card.fileName}
					<SettingsModelCard
						{active}
						downloadDisabled={embeddingStore.downloadingFile !== null}
						downloaded={status.localModels.some(
							({ fileName, downloaded }) => fileName === card.fileName && downloaded
						)}
						downloading={embeddingStore.downloadingFile === card.fileName}
						model={card}
						onDelete={active ? undefined : () => (pendingDelete = card.fileName)}
						onDownload={() => void embeddingStore.download(card.fileName)}
						onUse={() => requestSwitch(LOCAL_MODEL_PROVIDER_ID, card.fileName)}
						percent={embeddingStore.progress?.percent ?? 0}
					/>
				{/each}
			</div>
		</SettingsFieldGroup>
	</div>
{:else}
	<div class="grid gap-3">
		<Skeleton class="h-16" />
		<Skeleton class="h-24" />
	</div>
{/if}

<DialogConfirmation
	open={pendingSwitch !== null}
	title="Switch embedding model?"
	description={`Switching to ${switchLabel} re-embeds all of your documents in the background. Until it finishes, semantic search only finds the ones already re-embedded.`}
	confirmLabel="Switch and re-embed"
	onOpenChange={(open) => !open && (pendingSwitch = null)}
	onConfirm={confirmSwitch}
/>

<DialogConfirmation
	open={pendingDelete !== null}
	title="Delete embedding model?"
	description={`This removes ${pendingDelete ?? ''} from disk. You can download it again later.`}
	confirmLabel="Delete"
	onOpenChange={(open) => !open && (pendingDelete = null)}
	onConfirm={async () => {
		if (pendingDelete) await embeddingStore.remove(pendingDelete);
		pendingDelete = null;
	}}
/>
