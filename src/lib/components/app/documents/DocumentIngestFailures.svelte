<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import X from '@lucide/svelte/icons/x';
	import { ActionIcon } from '$lib/components/app/actions';
	import { DialogConfirmation } from '$lib/components/app/dialogs';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/components/ui/utils';
	import type { IngestFailure } from '$lib/types';

	interface Props {
		failures: IngestFailure[];
		onClearAll: () => Promise<void> | void;
		onDismiss: (id: string) => Promise<void> | void;
	}

	let { failures, onClearAll, onDismiss }: Props = $props();
	let collapsed = $state(false);
	let expandedId = $state<string | null>(null);
	let clearOpen = $state(false);

	function formatDate(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleString([], {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	async function confirmClearAll(): Promise<void> {
		clearOpen = false;
		await onClearAll();
	}
</script>

{#if failures.length}
	<section class="dk-panel overflow-hidden rounded-lg border border-destructive/40 shadow-sm">
		<header class="flex items-center gap-1.5 bg-destructive/5 px-2 py-1.5">
			<ActionIcon
				class={cn('size-7 border-0 bg-transparent shadow-none', !collapsed && '[&_svg]:rotate-180')}
				label={collapsed ? 'Expand failed ingests' : 'Collapse failed ingests'}
				size="icon-sm"
				variant="ghost"
				onclick={() => (collapsed = !collapsed)}
			>
				<ChevronDown class="transition-transform" />
			</ActionIcon>
			<TriangleAlert class="size-4 shrink-0 text-destructive" />
			<div class="flex-1 text-sm font-semibold text-destructive">
				{failures.length} failed to ingest
			</div>
			<Button size="sm" variant="destructive" onclick={() => (clearOpen = true)}>Clear all</Button>
		</header>
		{#if !collapsed}
			<div class="grid divide-y divide-border/70">
				{#each failures as failure (failure.id)}
					<div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-2 py-2">
						<button
							class="grid min-w-0 gap-0.5 text-left"
							type="button"
							aria-expanded={expandedId === failure.id}
							onclick={() => (expandedId = expandedId === failure.id ? null : failure.id)}
						>
							<div class="min-w-0 truncate text-sm font-medium" title={failure.sourcePath}>
								{failure.title}
							</div>
							<div class="min-w-0 truncate text-xs text-muted-foreground">{failure.message}</div>
							<div class="text-xs text-muted-foreground">{formatDate(failure.createdAt)}</div>
							{#if expandedId === failure.id}
								<div class="mt-1.5 grid gap-1 text-xs text-muted-foreground">
									<div><strong class="text-foreground">File:</strong> {failure.sourcePath}</div>
									{#if failure.stage}
										<div><strong class="text-foreground">Stage:</strong> {failure.stage}</div>
									{/if}
									<div><strong class="text-foreground">Error:</strong> {failure.message}</div>
									{#if failure.stack}
										<pre
											class="mt-1 max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] whitespace-pre-wrap">{failure.stack}</pre>
									{/if}
								</div>
							{/if}
						</button>
						<ActionIcon
							class="border-0 bg-transparent shadow-none"
							label={`Dismiss failure for ${failure.title}`}
							size="icon-sm"
							variant="ghost"
							onclick={() => onDismiss(failure.id)}
						>
							<X />
						</ActionIcon>
					</div>
				{/each}
			</div>
		{/if}
	</section>
{/if}

<DialogConfirmation
	confirmLabel="Clear all"
	description={`Dismiss all ${failures.length} failed ingest${failures.length === 1 ? '' : 's'}?`}
	onConfirm={confirmClearAll}
	onOpenChange={(open) => (clearOpen = open)}
	open={clearOpen}
/>
