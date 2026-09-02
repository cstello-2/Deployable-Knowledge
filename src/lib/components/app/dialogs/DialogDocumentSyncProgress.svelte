<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Minus from '@lucide/svelte/icons/minus';
	import X from '@lucide/svelte/icons/x';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Progress } from '$lib/components/ui/progress';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { ApiDocumentIngestProgress, ApiDocumentSyncFileProgress } from '$lib/types';

	interface Props {
		files: ApiDocumentSyncFileProgress[];
		open: boolean;
		progress: ApiDocumentIngestProgress | null;
		settled: number;
		total: number;
	}

	let { files, open, progress, settled, total }: Props = $props();
	const percent = $derived(Math.max(0, Math.min(100, progress?.percent ?? 0)));
	const counted = $derived(total > 1 ? `${Math.min(settled, total)} of ${total} files` : '');
</script>

<Dialog.Root {open}>
	<Dialog.Content class="sm:max-w-lg" showCloseButton={false}>
		<Dialog.Header>
			<Dialog.Title>{progress?.label ?? 'Syncing folder'}</Dialog.Title>
			<Dialog.Description>{progress?.message ?? 'Scanning for PDFs.'}</Dialog.Description>
		</Dialog.Header>
		<div class="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
			<Progress value={percent} />
			<strong class="text-right text-sm tabular-nums">{Math.round(percent)}%</strong>
		</div>
		{#if counted}
			<p class="text-xs tabular-nums text-muted-foreground">{counted}</p>
		{/if}
		{#if files.length}
			<ScrollArea class="max-h-56 rounded-lg border" scrollbarYClasses="hidden">
				<div class="grid divide-y divide-border/70">
					{#each files as file (file.sourcePath)}
						<div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
							{#if file.status === 'ingesting'}
								<LoaderCircle class="size-4 animate-spin text-primary" />
							{:else if file.status === 'added'}
								<Check class="size-4 text-primary" />
							{:else if file.status === 'failed'}
								<X class="size-4 text-destructive" />
							{:else}
								<Minus class="size-4 text-muted-foreground" />
							{/if}
							<span class="truncate text-xs">{file.sourcePath}</span>
							<span class="text-[11px] text-muted-foreground">{file.status}</span>
						</div>
					{/each}
				</div>
			</ScrollArea>
		{/if}
	</Dialog.Content>
</Dialog.Root>
