<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import X from '@lucide/svelte/icons/x';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Input } from '$lib/components/ui/input';

	interface Props {
		activeIndex: number;
		count: number;
		onClose: () => void;
		onNext: () => void;
		onPrev: () => void;
		query: string;
	}

	let { activeIndex, count, onClose, onNext, onPrev, query = $bindable() }: Props = $props();

	let input = $state<HTMLInputElement | null>(null);

	$effect(() => {
		input?.focus();
		input?.select();
	});

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (event.shiftKey) onPrev();
			else onNext();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
		}
	}
</script>

<div class="flex items-center gap-1.5 rounded-lg border bg-card p-1.5 shadow-lg">
	<Input
		bind:ref={input}
		bind:value={query}
		aria-label="Find in page"
		class="h-7 w-40 text-xs"
		onkeydown={handleKeydown}
		placeholder="Find in page…"
	/>
	<span class="shrink-0 text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
		{count ? `${activeIndex} / ${count}` : 'No matches'}
	</span>
	<ActionIcon
		class="size-7"
		disabled={!count}
		label="Previous match"
		variant="ghost"
		onclick={onPrev}><ChevronUp /></ActionIcon
	>
	<ActionIcon class="size-7" disabled={!count} label="Next match" variant="ghost" onclick={onNext}
		><ChevronDown /></ActionIcon
	>
	<ActionIcon class="size-7" label="Close find bar" variant="ghost" onclick={onClose}
		><X /></ActionIcon
	>
</div>
