<script lang="ts">
	import ArrowDownAZ from '@lucide/svelte/icons/arrow-down-a-z';
	import ArrowDownZA from '@lucide/svelte/icons/arrow-down-z-a';
	import Funnel from '@lucide/svelte/icons/funnel';
	import X from '@lucide/svelte/icons/x';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Input } from '$lib/components/ui/input';
	import type { SortDirection } from '$lib/types';
	import DocumentTagChip from './DocumentTagChip.svelte';
	import TagFilterMenu from './TagFilterMenu.svelte';

	interface Props {
		onCreateTag: (tag: string) => Promise<void> | void;
		onDeleteTag: (tag: string) => void;
		onToggleSort: () => void;
		onToggleTag: (tag: string) => void;
		query: string;
		selectedTags: string[];
		sort: SortDirection;
		tags: string[];
	}

	let {
		onCreateTag,
		onDeleteTag,
		onToggleSort,
		onToggleTag,
		query = $bindable(),
		selectedTags,
		sort,
		tags
	}: Props = $props();
</script>

<div class="grid gap-2">
	<div class="flex items-center gap-2">
		<Input
			aria-label="Filter documents"
			bind:value={query}
			class="flex-1"
			placeholder="Filter documents (fuzzy match on name & tags)…"
			type="search"
		/>
		{#if query}<ActionIcon label="Clear filter" onclick={() => (query = '')}><X /></ActionIcon>{/if}
		<ActionIcon
			label={sort === 'asc' ? 'Sort by name, A to Z' : 'Sort by name, Z to A'}
			onclick={onToggleSort}
		>
			{#if sort === 'asc'}<ArrowDownAZ />{:else}<ArrowDownZA />{/if}
		</ActionIcon>
		<TagFilterMenu
			onCreate={onCreateTag}
			onDelete={onDeleteTag}
			onToggle={onToggleTag}
			selected={selectedTags}
			{tags}
			title="Filter and manage tags"
			triggerIcon={Funnel}
			triggerLabel="Filter"
			triggerTooltip="Filter by tags"
		/>
	</div>
	{#if selectedTags.length}
		<div class="flex min-h-7 flex-wrap items-center gap-2">
			{#each selectedTags as tag (tag)}
				<DocumentTagChip {tag} onRemove={() => onToggleTag(tag)} />
			{/each}
		</div>
	{/if}
</div>
