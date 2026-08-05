<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import X from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Input } from '$lib/components/ui/input';

	interface Props {
		currentIndex: number;
		matchCount: number;
		onClose: () => void;
		onNext: () => void;
		onPrev: () => void;
		query: string;
	}

	let { currentIndex, matchCount, onClose, onNext, onPrev, query = $bindable() }: Props = $props();
	let inputRef = $state<HTMLInputElement | null>(null);
	let barElement = $state<HTMLDivElement | null>(null);

	onMount(() => inputRef?.focus());

	// Escape is handled by NotebookWindow instead of here: jumping to a match moves
	// focus into the textarea/preview, outside this bar entirely, so a listener
	// scoped to the bar alone would stop seeing Escape the moment you navigate to a
	// result. Bound as a plain DOM listener (rather than a Svelte onkeydown
	// attribute) so it also works from the nav buttons, not just the input, without
	// tripping the "non-interactive element with a keyboard listener" a11y check
	// that a bare div wrapper would raise.
	onMount(() => {
		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Enter' && event.target === inputRef) {
				event.preventDefault();
				if (event.shiftKey) onPrev();
				else onNext();
			}
		};
		barElement?.addEventListener('keydown', handleKeydown);
		return () => barElement?.removeEventListener('keydown', handleKeydown);
	});
</script>

<div bind:this={barElement} class="flex items-center gap-1 border-b bg-card/70 px-2 py-1.5">
	<Input
		bind:ref={inputRef}
		bind:value={query}
		aria-label="Search this page"
		class="h-7 flex-1"
		placeholder="Search this page…"
	/>
	<span class="w-14 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
		{matchCount ? `${currentIndex + 1}/${matchCount}` : query ? 'No matches' : ''}
	</span>
	<ActionIcon
		class="size-7"
		disabled={!matchCount}
		label="Previous match"
		onclick={onPrev}
		size="icon-sm"
		variant="ghost"
	>
		<ChevronUp />
	</ActionIcon>
	<ActionIcon
		class="size-7"
		disabled={!matchCount}
		label="Next match"
		onclick={onNext}
		size="icon-sm"
		variant="ghost"
	>
		<ChevronDown />
	</ActionIcon>
	<ActionIcon class="size-7" label="Close search" onclick={onClose} size="icon-sm" variant="ghost">
		<X />
	</ActionIcon>
</div>
