<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Progress } from '$lib/components/ui/progress';
	import { LOCAL_MODEL_TIERS } from '$lib/constants';
	import { localModelsStore } from '$lib/stores';
	import { formatBytes } from '$lib/utils';

	const downloading = $derived(localModelsStore.downloadingTier !== null);
	const percent = $derived(Math.max(0, Math.min(100, localModelsStore.progress?.percent ?? 0)));

	function close(open: boolean): void {
		if (!open && !downloading) localModelsStore.skipOffer();
	}
</script>

<Dialog.Root open={localModelsStore.offerOpen} onOpenChange={close}>
	<Dialog.Content showCloseButton={!downloading} class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Set up a local model</Dialog.Title>
			<Dialog.Description>
				Download a model to chat fully offline, without any external services. Pick the option that
				matches your hardware.
			</Dialog.Description>
		</Dialog.Header>

		{#if downloading}
			<div class="grid gap-2" aria-live="polite">
				<p class="m-0 text-sm text-muted-foreground">
					{localModelsStore.progress?.message ?? 'Starting download.'}
				</p>
				<div class="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
					<Progress value={percent} />
					<strong class="text-right text-sm tabular-nums">{Math.round(percent)}%</strong>
				</div>
			</div>
		{:else}
			<div class="grid gap-2" role="radiogroup" aria-label="Local model options">
				{#each LOCAL_MODEL_TIERS as tier (tier.id)}
					{@const selected = localModelsStore.selectedTier === tier.id}
					<button
						type="button"
						role="radio"
						aria-checked={selected}
						class={[
							'grid gap-1 rounded-lg border p-3 text-left transition-colors',
							selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
						]}
						onclick={() => (localModelsStore.selectedTier = tier.id)}
					>
						<span class="flex flex-wrap items-center gap-2">
							<span class="text-sm font-semibold">{tier.label}</span>
							{#if selected}<Check class="ml-auto size-4 text-primary" />{/if}
						</span>
						<span class="text-xs text-muted-foreground">{tier.description}</span>
						<span class="text-xs text-muted-foreground">
							{tier.fileName} · {formatBytes(tier.sizeBytes)} download · needs ~{tier.minRamGiB} GiB RAM
						</span>
					</button>
				{/each}
			</div>

			{#if localModelsStore.error}
				<p class="m-0 text-sm text-destructive">{localModelsStore.error}</p>
			{/if}

			<Dialog.Footer>
				<Button variant="outline" onclick={() => localModelsStore.skipOffer()}>Skip for now</Button>
				<Button
					disabled={!localModelsStore.selectedTier}
					onclick={() =>
						localModelsStore.selectedTier &&
						void localModelsStore.download(localModelsStore.selectedTier)}
				>
					Download
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
