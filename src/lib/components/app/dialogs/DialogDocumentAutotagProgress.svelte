<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Minus from '@lucide/svelte/icons/minus';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Progress } from '$lib/components/ui/progress';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type {
		ApiDocumentAutotagEntry,
		ApiDocumentAutotagStatus,
		ApiDocumentIngestProgress
	} from '$lib/types';
	import { documentTagHue } from '$lib/utils';

	interface Props {
		entries: ApiDocumentAutotagEntry[];
		open: boolean;
		progress: ApiDocumentIngestProgress | null;
		settled: number;
		total: number;
	}

	let { entries, open, progress, settled, total }: Props = $props();

	const STATUS_LABELS: Record<ApiDocumentAutotagStatus, string> = {
		tagged: 'tagged',
		unchanged: 'no new tags',
		skipped: 'no embeddings'
	};

	const percent = $derived(Math.max(0, Math.min(100, progress?.percent ?? 0)));
	const counted = $derived(total > 1 ? `${Math.min(settled, total)} of ${total} documents` : '');
</script>

<Dialog.Root {open}>
	<Dialog.Content class="sm:max-w-lg" showCloseButton={false}>
		<Dialog.Header>
			<Dialog.Title>{progress?.label ?? 'Autotagging'}</Dialog.Title>
			<Dialog.Description>
				{progress?.message ?? 'Matching documents against your tags.'}
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
			<Progress value={percent} />
			<strong class="text-right text-sm tabular-nums">{Math.round(percent)}%</strong>
		</div>
		{#if counted}
			<p class="text-xs tabular-nums text-muted-foreground">{counted}</p>
		{/if}
		{#if entries.length}
			<ScrollArea class="max-h-56 rounded-lg border" scrollbarYClasses="hidden">
				<div class="grid divide-y divide-border/70">
					{#each entries as entry (entry.documentId)}
						<div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 px-3 py-2">
							{#if entry.status === 'tagged'}
								<Check class="size-4 text-primary" />
							{:else}
								<Minus class="size-4 text-muted-foreground" />
							{/if}
							<div class="grid min-w-0 gap-1">
								<span class="truncate text-xs">{entry.title}</span>
								{#if entry.tags.length}
									<div class="flex flex-wrap gap-1">
										{#each entry.tags as tag (tag)}
											<Badge
												class="dk-tag dk-tag-selected"
												style={`--tag-hue: ${documentTagHue(tag)}`}
												variant="outline">#{tag}</Badge
											>
										{/each}
									</div>
								{/if}
							</div>
							<span class="text-[11px] text-muted-foreground">{STATUS_LABELS[entry.status]}</span>
						</div>
					{/each}
				</div>
			</ScrollArea>
		{/if}
	</Dialog.Content>
</Dialog.Root>
