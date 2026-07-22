<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Input } from '$lib/components/ui/input';
	import DocumentTagChip from './DocumentTagChip.svelte';
	import TagFilterMenu from './TagFilterMenu.svelte';

	interface Props {
		onCreateTag: (tag: string) => Promise<void> | void;
		onDeleteTag: (tag: string) => void;
		onToggleTag: (tag: string) => void;
		query: string;
		selectedTags: string[];
		tags: string[];
	}

	let {
		onCreateTag,
		onDeleteTag,
		onToggleTag,
		query = $bindable(),
		selectedTags,
		tags
	}: Props = $props();
</script>

<div class="grid gap-2">
	<div class="flex items-center gap-2">
		<Input
			aria-label="Filter documents"
			bind:value={query}
			class="flex-1"
			placeholder="Filter documents by name or tags…"
			type="search"
		/>
		{#if query}<ActionIcon label="Clear filter" onclick={() => (query = '')}><X /></ActionIcon>{/if}
		<TagFilterMenu
			compact
			onCreate={onCreateTag}
			onDelete={onDeleteTag}
			onToggle={onToggleTag}
			selected={selectedTags}
			{tags}
			title="Filter and manage tags"
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
