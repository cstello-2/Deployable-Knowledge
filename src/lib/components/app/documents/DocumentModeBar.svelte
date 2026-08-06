<script lang="ts">
	import PowerOff from '@lucide/svelte/icons/power-off';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import type { DocumentListMode } from '$lib/types';

	interface Props {
		busy?: boolean;
		mode: DocumentListMode;
		onDeactivateAll: () => void;
		onModeChange: (mode: DocumentListMode) => void;
		onRemoveAll: () => void;
	}

	let { busy = false, mode, onDeactivateAll, onModeChange, onRemoveAll }: Props = $props();

	const modes: { value: DocumentListMode; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'active', label: 'Active in RAG' },
		{ value: 'inactive', label: 'Inactive' }
	];
</script>

<div class="flex flex-wrap items-center gap-2">
	<ButtonGroup.Root>
		{#each modes as item (item.value)}
			<Button
				variant={mode === item.value ? 'default' : 'outline'}
				aria-pressed={mode === item.value}
				onclick={() => onModeChange(item.value)}
			>
				{item.label}
			</Button>
		{/each}
	</ButtonGroup.Root>
	<div class="ml-auto flex items-center gap-2">
		<Button disabled={busy} variant="outline" onclick={onDeactivateAll}>
			<PowerOff /> Deactivate all
		</Button>
		<Button disabled={busy} variant="destructive" onclick={onRemoveAll}>
			<Trash2 /> Remove all
		</Button>
	</div>
</div>
