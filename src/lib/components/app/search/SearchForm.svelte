<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import { Input } from '$lib/components/ui/input';
	import { RetrievalMode } from '$lib/enums';

	interface Props {
		loading?: boolean;
		onSubmit: () => Promise<void> | void;
		query: string;
		ragTopK: number;
		retrievalMode: RetrievalMode;
	}

	let {
		loading = false,
		onSubmit,
		query = $bindable(),
		ragTopK = $bindable(),
		retrievalMode = $bindable()
	}: Props = $props();

	const modes = [
		{ value: RetrievalMode.SEMANTIC, label: 'Semantic' },
		{ value: RetrievalMode.BM25, label: 'BM25' },
		{ value: RetrievalMode.HYBRID, label: 'Hybrid' },
		{ value: RetrievalMode.KNOWLEDGE_GRAPH, label: 'Knowledge Graph' }
	];
</script>

<form
	class="grid gap-2"
	onsubmit={(event) => {
		event.preventDefault();
		void onSubmit();
	}}
>
	<div
		class="grid grid-cols-[minmax(0,1fr)_5rem_auto] gap-2 max-sm:grid-cols-[minmax(0,1fr)_4.5rem]"
	>
		<Input
			type="search"
			placeholder="Enter search text…"
			bind:value={query}
			aria-label="Search text"
		/>
		<Input type="number" min="1" step="1" bind:value={ragTopK} aria-label="Number of chunks" />
		<Button type="submit" disabled={loading} class="max-sm:col-span-2"
			><Search /> {loading ? 'Searching…' : 'Search'}</Button
		>
	</div>
	<ButtonGroup.Root class="w-fit">
		{#each modes as mode (mode.value)}
			<Button
				variant={retrievalMode === mode.value ? 'default' : 'outline'}
				size="sm"
				aria-pressed={retrievalMode === mode.value}
				onclick={() => (retrievalMode = mode.value)}
			>
				{mode.label}
			</Button>
		{/each}
	</ButtonGroup.Root>
</form>
