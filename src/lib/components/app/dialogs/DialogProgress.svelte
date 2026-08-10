<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Progress } from '$lib/components/ui/progress';

	interface ProgressValue {
		label?: string;
		message?: string;
		percent?: number;
	}

	interface Props {
		// Allows closing the dialog while the operation keeps running
		dismissible?: boolean;
		error?: string;
		errorDetail?: string;
		errorTitle?: string;
		onClose?: () => void;
		onRetry?: () => void;
		open: boolean;
		progress?: ProgressValue | null;
		title?: string;
	}

	let {
		dismissible = false,
		error = '',
		errorDetail = '',
		errorTitle = 'Operation failed',
		onClose = () => {},
		onRetry,
		open,
		progress = null,
		title = 'Working'
	}: Props = $props();

	const hasPercent = $derived(Number.isFinite(progress?.percent));
	const percent = $derived(Math.max(0, Math.min(100, progress?.percent ?? 0)));
</script>

<Dialog.Root {open} onOpenChange={(next) => !next && onClose()}>
	<Dialog.Content showCloseButton={Boolean(error) || dismissible} class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{error ? errorTitle : (progress?.label ?? title)}</Dialog.Title>
			<Dialog.Description>
				{error ? errorDetail || error : progress?.message || 'Please wait.'}
			</Dialog.Description>
		</Dialog.Header>

		{#if error}
			<p class="text-sm text-destructive">{error}</p>
			<Dialog.Footer>
				<Button variant="outline" onclick={onClose}>Close</Button>
				{#if onRetry}<Button onclick={onRetry}>Retry</Button>{/if}
			</Dialog.Footer>
		{:else}
			<div class="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3" aria-live="polite">
				<Progress value={hasPercent ? percent : 30} class={!hasPercent ? 'animate-pulse' : ''} />
				<strong class="text-right text-sm tabular-nums">
					{hasPercent ? `${Math.round(percent)}%` : '…'}
				</strong>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
