<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea';

	interface Props {
		atLimit?: boolean;
		characterCount: number;
		characterLimit: number;
		charactersRemaining: number;
		nearLimit?: boolean;
		notes: string;
		onInput: () => void;
		pageLimit: number;
	}

	let {
		atLimit = false,
		characterCount,
		characterLimit,
		charactersRemaining,
		nearLimit = false,
		notes = $bindable(),
		onInput,
		pageLimit
	}: Props = $props();
</script>

<div class="relative min-h-0">
	<Textarea
		class="h-full min-h-0 resize-none rounded-none border-0 bg-transparent px-4 py-3 pb-8 shadow-none focus-visible:border-transparent focus-visible:ring-0"
		bind:value={notes}
		maxlength={pageLimit}
		oninput={onInput}
		placeholder="Write notes here…"
		aria-label="Notebook notes"
	/>
	<div
		class={[
			'pointer-events-none absolute right-3 bottom-2 text-[11px] text-muted-foreground',
			nearLimit && !atLimit && 'text-amber-600 dark:text-amber-400',
			atLimit && 'text-destructive'
		]}
		role="status"
		aria-live="polite"
	>
		{characterCount.toLocaleString()} / {characterLimit.toLocaleString()} characters{atLimit
			? ' · limit reached'
			: nearLimit
				? ` · ${charactersRemaining.toLocaleString()} remaining`
				: ''}
	</div>
</div>
