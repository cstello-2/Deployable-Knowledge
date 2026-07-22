<script lang="ts">
	import Tag from '@lucide/svelte/icons/tag';
	import TagOff from '@lucide/svelte/icons/tag-x';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		count: number;
		onApplyTag: () => void;
		onRemoveTag: () => void;
	}

	let { count, onApplyTag, onRemoveTag }: Props = $props();
</script>

{#if count > 0}
	<div class="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2">
		<span class="mr-auto text-xs text-muted-foreground">{count} selected</span>
		<Button variant="outline" size="sm" onclick={onApplyTag}><Tag /> Apply tag</Button>
		<Button variant="outline" size="sm" onclick={onRemoveTag}><TagOff /> Remove tag</Button>
	</div>
{/if}
