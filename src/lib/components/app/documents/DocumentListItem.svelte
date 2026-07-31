<script lang="ts">
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import FileText from '@lucide/svelte/icons/file-text';
	import Power from '@lucide/svelte/icons/power';
	import PowerOff from '@lucide/svelte/icons/power-off';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import type { DocumentRow } from '$lib/types';
	import DocumentTagChip from './DocumentTagChip.svelte';
	import TagFilterMenu from './TagFilterMenu.svelte';

	interface Props {
		busy?: boolean;
		document: DocumentRow;
		onCreateTag: (tag: string) => Promise<void> | void;
		onDelete: () => void;
		onToggle: (selected: boolean) => void;
		onToggleActive: () => void;
		onToggleTag: (tag: string) => void;
		selected?: boolean;
		tags: string[];
	}

	let {
		busy = false,
		document,
		onCreateTag,
		onDelete,
		onToggle,
		onToggleActive,
		onToggleTag,
		selected = false,
		tags
	}: Props = $props();

	const SourceIcon = $derived(
		document.sourceType === 'AUDIO'
			? AudioLines
			: document.sourceType === 'XLSX' || document.sourceType === 'CSV'
				? FileSpreadsheet
				: FileText
	);
</script>

<div
	class={[
		'grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-2.5 px-2 py-2 transition-colors hover:bg-muted/35',
		selected && 'bg-primary/5'
	]}
>
	<Checkbox
		checked={selected}
		aria-label={`Use ${document.title} in chat`}
		onCheckedChange={onToggle}
	/>
	<SourceIcon class="size-[18px] text-muted-foreground" />
	<div class="grid min-w-0 gap-1">
		<div class="flex min-w-0 items-center gap-2">
			<strong class="min-w-0 truncate text-sm">{document.title}</strong>
			<span class="shrink-0 text-xs text-muted-foreground">{document.chunkCount} chunks</span>
			{#if !document.active}
				<span class="shrink-0 text-xs text-muted-foreground">· inactive</span>
			{/if}
			<ActionIcon
				class="ml-auto border-0 bg-transparent shadow-none"
				disabled={busy}
				label={document.active ? `Deactivate ${document.title}` : `Activate ${document.title}`}
				size="icon-sm"
				variant="ghost"
				onclick={onToggleActive}
			>
				{#if document.active}<PowerOff />{:else}<Power />{/if}
			</ActionIcon>
			<ActionIcon
				class="border-0 bg-transparent shadow-none hover:text-destructive"
				disabled={busy}
				label={`Remove ${document.title}`}
				size="icon-sm"
				variant="ghost"
				onclick={onDelete}
			>
				<Trash2 />
			</ActionIcon>
		</div>
		<div class="flex flex-wrap items-center gap-1.5">
			{#each document.tags as tag (tag)}
				<DocumentTagChip {tag} onRemove={() => onToggleTag(tag)} />
			{/each}
			<TagFilterMenu
				compact
				onCreate={onCreateTag}
				selected={document.tags}
				{tags}
				title="Edit tags"
				onToggle={onToggleTag}
			/>
		</div>
	</div>
</div>
