<script lang="ts">
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import BookmarkPlus from '@lucide/svelte/icons/bookmark-plus';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import FileText from '@lucide/svelte/icons/file-text';
	import Globe from '@lucide/svelte/icons/globe';
	import Video from '@lucide/svelte/icons/video';
	import { buttonVariants } from '$lib/components/ui/button';
	import { cn } from '$lib/components/ui/utils';
	import { documentViewerHref } from '$lib/constants';
	import type { AgentOutput } from '$lib/types';

	// One style for every source action; only the icon and behaviour differ
	const ACTION_CLASS = cn(
		buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
		'cursor-pointer text-muted-foreground hover:text-foreground'
	);

	type SourceOutput = Extract<AgentOutput, { type: 'source' }>;

	interface Props {
		onSaveChunk?: (chunkId: string) => Promise<void> | void;
		sources: SourceOutput[];
	}

	let { onSaveChunk, sources }: Props = $props();

	const COLLAPSE_THRESHOLD = 5;

	let expanded = $state(false);

	const visibleSources = $derived(
		expanded || sources.length <= COLLAPSE_THRESHOLD
			? sources
			: sources.slice(0, COLLAPSE_THRESHOLD)
	);
	const hiddenCount = $derived(sources.length - COLLAPSE_THRESHOLD);

	function hrefFor(output: SourceOutput): string | undefined {
		if (!output.data.documentId) return output.data.url;
		return documentViewerHref(output.data.sourceType, output.data.documentId, output.data);
	}

	function iconFor(output: SourceOutput) {
		if (!output.data.documentId) return Globe;
		if (output.data.sourceType === 'AUDIO') return AudioLines;
		if (output.data.sourceType === 'YOUTUBE') return Video;
		return FileText;
	}
</script>

{#if sources.length}
	<!-- min-w-0 at every grid level: these are grid items, whose default
	     min-width:auto lets the nowrap label push the row past the pane -->
	<ol class="grid min-w-0 list-inside gap-1 text-xs text-muted-foreground">
		{#each visibleSources as source (`source-${source.id}`)}
			{@const href = hrefFor(source)}
			{@const TypeIcon = iconFor(source)}
			{@const label = source.data.title || 'Document source'}
			<li
				class="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded px-1 py-0.5 hover:bg-muted hover:text-foreground"
			>
				<!-- min-w-0 lets the label shrink so truncate can ellipsize it -->
				<div class="flex min-w-0 flex-1 items-center gap-1">
					<TypeIcon class="size-3 shrink-0" />
					<span class="truncate" title={label}>
						<strong class="text-foreground">{label}</strong>{source.data.description
							? ` ${source.data.description}`
							: ''}
					</span>
				</div>
				<div class="flex shrink-0 items-center gap-0.5">
					{#if href}
						<a
							class={ACTION_CLASS}
							{href}
							rel="external noopener noreferrer"
							target="_blank"
							title="Open source"
							aria-label="Open source"
						>
							<ExternalLink class="size-3" />
						</a>
					{/if}
					{#if source.data.chunkId && onSaveChunk}
						<button
							type="button"
							class={ACTION_CLASS}
							title="Save chunk"
							aria-label="Save chunk"
							onclick={() => onSaveChunk?.(source.data.chunkId!)}
						>
							<BookmarkPlus class="size-3" />
						</button>
					{/if}
				</div>
			</li>
		{/each}
	</ol>
	{#if sources.length > COLLAPSE_THRESHOLD}
		<button
			type="button"
			class="cursor-pointer justify-self-start rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={() => (expanded = !expanded)}
		>
			{expanded
				? 'Show fewer sources'
				: `Show ${hiddenCount} more source${hiddenCount === 1 ? '' : 's'}`}
		</button>
	{/if}
{/if}
