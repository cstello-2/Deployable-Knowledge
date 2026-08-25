<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { onMount, tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { DiagnosticsService } from '$lib/services';
	import { diagnosticsStore } from '$lib/stores';
	import type { ApiDiagnosticsSnapshot, DiagnosticEvent, DiagnosticLevel } from '$lib/types';
	import { formatBytes } from '$lib/utils';

	type LevelFilter = 'all' | DiagnosticLevel;
	type HealthValue = ApiDiagnosticsSnapshot['health'][keyof ApiDiagnosticsSnapshot['health']];

	const filters: LevelFilter[] = ['all', 'info', 'warning', 'error'];
	const levelClasses: Record<DiagnosticLevel, string> = {
		info: 'text-primary',
		warning: 'text-muted-foreground',
		error: 'text-destructive'
	};

	let level = $state<LevelFilter>('all');
	let viewport = $state<HTMLDivElement | null>(null);

	const visibleEvents = $derived(
		level === 'all'
			? diagnosticsStore.events
			: diagnosticsStore.events.filter((event) => event.level === level)
	);

	$effect(() => {
		const eventCount = visibleEvents.length;
		if (!eventCount || diagnosticsStore.paused || !viewport) return;
		void tick().then(() => viewport?.scrollTo({ top: viewport.scrollHeight }));
	});

	function eventDetails(event: DiagnosticEvent): string {
		return Object.entries(event.details)
			.map(([key, value]) => `${key}=${String(value)}`)
			.join(' ');
	}

	function eventTime(timestamp: string): string {
		return new Date(timestamp).toLocaleTimeString();
	}

	function healthVariant(value: HealthValue): BadgeVariant {
		if (value === 'healthy' || value === 'installed' || value === 'ready') return 'default';
		if (value === 'missing') return 'secondary';
		return 'destructive';
	}

	function countLabel(value: number | null): string {
		return value === null ? 'Unavailable' : value.toLocaleString();
	}

	async function downloadReport(): Promise<void> {
		try {
			const filename = await DiagnosticsService.downloadReport();
			toast.success(`Downloaded ${filename}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not download diagnostics.');
		}
	}

	onMount(() => {
		diagnosticsStore.start();
		return () => diagnosticsStore.stop();
	});
</script>

{#snippet headerActions()}
	<ActionIcon
		class="size-7"
		disabled={diagnosticsStore.loading}
		label="Refresh diagnostics"
		onclick={() => void diagnosticsStore.refresh()}
	>
		<RefreshCw />
	</ActionIcon>
	<ActionIcon
		class="size-7"
		label={diagnosticsStore.paused ? 'Resume event updates' : 'Pause event updates'}
		onclick={() => diagnosticsStore.setPaused(!diagnosticsStore.paused)}
		pressed={diagnosticsStore.paused}
	>
		{#if diagnosticsStore.paused}<Play />{:else}<Pause />{/if}
	</ActionIcon>
{/snippet}

<div
	class={[
		'dk-panel grid h-full min-h-0 w-full overflow-hidden rounded-lg border bg-background',
		diagnosticsStore.snapshot ? 'grid-rows-[auto_auto_auto_1fr]' : 'grid-rows-[auto_1fr]'
	]}
	id="settings-diagnostics-console"
>
	{#if diagnosticsStore.snapshot}
		{@const snapshot = diagnosticsStore.snapshot}
		<section
			aria-label="System health"
			class="flex flex-wrap items-center gap-2 border-b bg-elevated/70 px-3 py-2"
		>
			<Badge variant={healthVariant(snapshot.health.database)}>
				Database: {snapshot.health.database}
			</Badge>
			<Badge variant={healthVariant(snapshot.health.searchIndex)}>
				Index: {snapshot.health.searchIndex}
			</Badge>
			<Badge variant={healthVariant(snapshot.health.embeddingModel)}>
				Embedding: {snapshot.health.embeddingModel}
			</Badge>
			<span class="ml-auto font-mono text-[11px] text-muted-foreground">
				v{snapshot.application.version}
			</span>
		</section>

		<section
			aria-label="Diagnostic counts"
			class="grid grid-cols-2 border-b bg-card/45 text-[11px] sm:grid-cols-4 lg:grid-cols-8"
		>
			<div class="border-r px-3 py-2">
				<span class="block text-muted-foreground">Documents</span>
				<strong class="font-mono font-medium">{countLabel(snapshot.counts.documents)}</strong>
			</div>
			<div class="border-r px-3 py-2">
				<span class="block text-muted-foreground">Active</span>
				<strong class="font-mono font-medium">{countLabel(snapshot.counts.activeDocuments)}</strong>
			</div>
			<div class="border-r px-3 py-2">
				<span class="block text-muted-foreground">Chunks</span>
				<strong class="font-mono font-medium">{countLabel(snapshot.counts.chunks)}</strong>
			</div>
			<div class="border-r px-3 py-2">
				<span class="block text-muted-foreground">Sessions</span>
				<strong class="font-mono font-medium">{countLabel(snapshot.counts.sessions)}</strong>
			</div>
			<div class="border-r px-3 py-2">
				<span class="block text-muted-foreground">Messages</span>
				<strong class="font-mono font-medium">{countLabel(snapshot.counts.messages)}</strong>
			</div>
			<div class="border-r px-3 py-2">
				<span class="block text-muted-foreground">Notebooks</span>
				<strong class="font-mono font-medium">{countLabel(snapshot.counts.notebooks)}</strong>
			</div>
			<div class="border-r px-3 py-2">
				<span class="block text-muted-foreground">Pages</span>
				<strong class="font-mono font-medium">{countLabel(snapshot.counts.notebookPages)}</strong>
			</div>
			<div class="px-3 py-2">
				<span class="block text-muted-foreground">Memory</span>
				<strong class="font-mono font-medium"
					>{formatBytes(snapshot.application.memoryBytes)}</strong
				>
			</div>
		</section>
	{/if}

	<div class="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
		{#each filters as filter (filter)}
			<Button
				aria-pressed={level === filter}
				onclick={() => (level = filter)}
				size="sm"
				variant={level === filter ? 'secondary' : 'ghost'}
			>
				{filter}
			</Button>
		{/each}
		<div class="ml-auto flex items-center gap-1.5">
			{@render headerActions()}
			<Button onclick={downloadReport} size="sm" variant="outline">
				<Download />
				Download .txt
			</Button>
		</div>
	</div>

	<ScrollArea bind:viewportRef={viewport} class="min-h-0">
		<div
			aria-live={diagnosticsStore.paused ? 'off' : 'polite'}
			class="min-h-full bg-elevated/25 p-2 font-mono text-[11px] leading-5"
			role="log"
		>
			{#if diagnosticsStore.error}
				<p class="m-0 rounded border border-destructive/50 bg-destructive/10 px-2 text-destructive">
					{diagnosticsStore.error}
				</p>
			{/if}

			{#each visibleEvents as event (event.sequence)}
				<div
					class="grid grid-cols-[5.5rem_4.5rem_7rem_minmax(0,1fr)] gap-2 border-b border-border/35 px-1 py-0.5 last:border-b-0"
				>
					<time class="text-muted-foreground">{eventTime(event.timestamp)}</time>
					<span class={levelClasses[event.level]}>{event.level.toUpperCase()}</span>
					<span class="text-primary">{event.subsystem}</span>
					<span class="min-w-0 break-words">
						<span>{event.message}</span>
						<span class="text-muted-foreground"> [{event.code}]</span>
						{#if eventDetails(event)}
							<span class="text-muted-foreground"> {eventDetails(event)}</span>
						{/if}
					</span>
				</div>
			{:else}
				<p class="m-0 p-2 text-muted-foreground">No diagnostic events recorded.</p>
			{/each}
		</div>
	</ScrollArea>
</div>
