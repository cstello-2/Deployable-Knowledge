<script lang="ts">
	import DatabaseZap from '@lucide/svelte/icons/database-zap';
	import Download from '@lucide/svelte/icons/download';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Pencil from '@lucide/svelte/icons/pencil';
	import MoveRight from '@lucide/svelte/icons/move-right';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { ActionIcon } from '$lib/components/app/actions';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	interface Props {
		addingToMasterCorpus?: boolean;
		exportDisabled?: boolean;
		exporting?: boolean;
		kind: 'notebook' | 'page';
		label: string;
		onAddToMasterCorpus?: () => Promise<void> | void;
		onDelete: () => void;
		onExport: () => Promise<void> | void;
		onMove?: () => void;
		onRename: () => void;
	}

	let {
		addingToMasterCorpus = false,
		exportDisabled = false,
		exporting = false,
		kind,
		label,
		onAddToMasterCorpus,
		onDelete,
		onExport,
		onMove,
		onRename
	}: Props = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<ActionIcon
				class="mr-2 size-7 border-0 bg-transparent shadow-none"
				label={`${label} actions`}
				size="icon-sm"
				triggerProps={props}
				variant="ghost"
			>
				<Ellipsis />
			</ActionIcon>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-44" sideOffset={4}>
		<DropdownMenu.Item onclick={onRename}>
			<Pencil />
			Rename
		</DropdownMenu.Item>
		{#if onMove}
			<DropdownMenu.Item onclick={onMove}>
				<MoveRight />
				Move to notebook
			</DropdownMenu.Item>
		{/if}
		<DropdownMenu.Item disabled={exportDisabled || exporting} onclick={onExport}>
			<Download />
			{exporting ? 'Exporting…' : kind === 'notebook' ? 'Export as ZIP' : 'Export as Markdown'}
		</DropdownMenu.Item>
		{#if onAddToMasterCorpus}
			<DropdownMenu.Item disabled={addingToMasterCorpus} onclick={onAddToMasterCorpus}>
				<DatabaseZap />
				{addingToMasterCorpus ? 'Adding…' : 'Add to search index'}
			</DropdownMenu.Item>
		{/if}
		<DropdownMenu.Item onclick={onDelete} variant="destructive">
			<Trash2 />
			Delete
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
