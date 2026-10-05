<script lang="ts">
	import Clock from '@lucide/svelte/icons/clock';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { Progress } from '$lib/components/ui/progress';
	import type { ApiDocumentIngestProgress } from '$lib/types';

	interface Props {
		/** Absent while the document is still waiting its turn. */
		progress?: ApiDocumentIngestProgress;
		title: string;
	}

	let { progress, title }: Props = $props();
</script>

<div
	aria-busy={Boolean(progress)}
	class="grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-2.5 bg-muted/15 px-2 py-2"
>
	<span aria-hidden="true" class="size-4"></span>
	{#if progress}
		<LoaderCircle class="size-[18px] animate-spin text-primary" />
	{:else}
		<Clock class="size-[18px] text-muted-foreground" />
	{/if}
	<div class="grid min-w-0 gap-1">
		<div class="flex min-w-0 items-center gap-2">
			<span class="min-w-0 truncate text-sm font-bold text-muted-foreground">{title}</span>
			<!-- Per-chunk ticks would flood the list's polite live region. -->
			<span aria-live="off" class="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
				{progress ? `${Math.round(progress.percent)}%` : 'Queued'}
			</span>
		</div>
		{#if progress}
			<Progress class="h-1.5" value={progress.percent} />
			<span aria-live="off" class="truncate text-xs text-muted-foreground">
				{progress.message}
			</span>
		{/if}
	</div>
</div>
