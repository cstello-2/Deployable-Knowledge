<script lang="ts">
	import { Button } from '$lib/components/ui/button';
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
		ref?: HTMLTextAreaElement | null;
	}

	let {
		atLimit = false,
		characterCount,
		characterLimit,
		charactersRemaining,
		nearLimit = false,
		notes = $bindable(),
		onInput,
		pageLimit,
		ref = $bindable(null)
	}: Props = $props();

	let selectedText = $state('');
	let selectionButtonVisible = $state(false);

	function limitSuffix(): string {
		if (atLimit) return ' · limit reached';
		if (nearLimit) return ` · ${charactersRemaining.toLocaleString()} remaining`;
		return '';
	}

	function handleSelection(event: Event): void {
		const textarea = event.currentTarget as HTMLTextAreaElement;
		const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).trim();
		selectedText = selected;
		selectionButtonVisible = selected.length > 0;
	}

	function sendSelectionToChat(): void {
		const text = selectedText.trim();
		if (!text) return;
		window.dispatchEvent(new CustomEvent('dk:send-to-chat', { detail: { text } }));
		selectionButtonVisible = false;
		selectedText = '';
	}

	// Delayed so a click on the button itself still registers before the textarea's
	// blur hides it.
	function handleBlur(): void {
		window.setTimeout(() => (selectionButtonVisible = false), 180);
	}
</script>

<div class="relative min-h-0 min-w-0">
	{#if selectionButtonVisible}
		<Button
			class="absolute top-2 right-3 z-10"
			onclick={sendSelectionToChat}
			size="sm"
			variant="secondary"
		>
			Send to chat
		</Button>
	{/if}
	<Textarea
		class="h-full min-h-0 resize-none rounded-none border-0 bg-transparent px-4 py-3 pb-8 shadow-none focus-visible:border-transparent focus-visible:ring-0"
		bind:value={notes}
		bind:ref
		maxlength={pageLimit}
		oninput={onInput}
		onblur={handleBlur}
		onkeyup={handleSelection}
		onmouseup={handleSelection}
		onselect={handleSelection}
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
		{characterCount.toLocaleString()} / {characterLimit.toLocaleString()} characters{limitSuffix()}
	</div>
</div>
