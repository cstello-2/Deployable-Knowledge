<script lang="ts">
	import Star from '@lucide/svelte/icons/star';
	import X from '@lucide/svelte/icons/x';
	import { ActionIcon } from '$lib/components/app/actions';
	import { CHUNK_RATING_LABELS, CHUNK_RATING_VALUES } from '$lib/constants';
	import type { ChunkRatingValue } from '$lib/types';

	interface Props {
		disabled?: boolean;
		onChange: (rating: ChunkRatingValue | null) => Promise<void> | void;
		rating: ChunkRatingValue | null;
	}

	let { disabled = false, onChange, rating }: Props = $props();
</script>

<div aria-label="Your rating for this search result" class="flex items-center gap-1" role="group">
	<span class="mr-1 text-xs text-muted-foreground">Your rating</span>

	{#each CHUNK_RATING_VALUES as value (value)}
		<ActionIcon
			class="size-6"
			{disabled}
			label={`Rate ${value} out of 5 — ${CHUNK_RATING_LABELS[value]}`}
			onclick={() => void onChange(value)}
			pressed={rating === value}
			size="icon-sm"
			variant="ghost"
		>
			<Star
				class={value <= (rating ?? 0) ? 'fill-primary text-primary' : 'text-muted-foreground'}
			/>
		</ActionIcon>
	{/each}

	{#if rating !== null}
		<ActionIcon
			class="size-6"
			{disabled}
			label="Clear rating"
			onclick={() => void onChange(null)}
			size="icon-sm"
			variant="ghost"
		>
			<X />
		</ActionIcon>
	{/if}
</div>
