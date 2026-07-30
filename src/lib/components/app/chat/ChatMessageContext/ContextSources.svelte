<script lang="ts">
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import BookmarkPlus from '@lucide/svelte/icons/bookmark-plus';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import FileText from '@lucide/svelte/icons/file-text';
	import Globe from '@lucide/svelte/icons/globe';
	import { documentViewerHref } from '$lib/constants';
	import type { AgentOutput } from '$lib/types';

	type SourceOutput = Extract<AgentOutput, { type: 'source' }>;

	interface Props {
		onSaveChunk?: (chunkId: string) => Promise<void> | void;
		sources: SourceOutput[];
	}

	let { onSaveChunk, sources }: Props = $props();

	function hrefFor(output: SourceOutput): string | undefined {
		if (!output.data.documentId) return output.data.url;
		return documentViewerHref(output.data.sourceType, output.data.documentId, output.data);
	}

	function iconFor(output: SourceOutput) {
		if (!output.data.documentId) return Globe;
		return output.data.sourceType === 'AUDIO' ? AudioLines : FileText;
	}
</script>

{#snippet sourceLabel(source: SourceOutput)}
	{@const TypeIcon = iconFor(source)}
	<TypeIcon class="mt-0.5 size-3 shrink-0" />
	<span
		><strong class="text-foreground">{source.data.title || 'Document source'}</strong>{source.data
			.description
			? ` ${source.data.description}`
			: ''}</span
	>
{/snippet}

{#if sources.length}
	<ol class="grid list-inside gap-1 text-xs text-muted-foreground">
		{#each sources as source (`source-${source.id}`)}
			{@const href = hrefFor(source)}
			<li class="flex">
				<div
					class="flex min-w-0 items-start gap-1 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground"
				>
					{#if href}
						<a
							class="inline-flex min-w-0 items-start gap-1"
							{href}
							rel="external noopener noreferrer"
							target="_blank"
						>
							{@render sourceLabel(source)}
							<ExternalLink class="mt-0.5 size-3 shrink-0" />
						</a>
					{:else}
						<span class="inline-flex min-w-0 items-start gap-1">
							{@render sourceLabel(source)}
						</span>
					{/if}
					{#if source.data.chunkId && onSaveChunk}
						<button
							type="button"
							class="mt-0.5 flex size-3 shrink-0 cursor-pointer rounded-xs outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40"
							title="Save chunk"
							aria-label="Save chunk"
							onclick={() => onSaveChunk?.(source.data.chunkId!)}
						>
							<BookmarkPlus class="size-3 translate-y-[0.5px]" />
						</button>
					{/if}
				</div>
			</li>
		{/each}
	</ol>
{/if}
