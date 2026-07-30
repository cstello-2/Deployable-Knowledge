<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';

	interface Props {
		limit: number;
		reserved: number;
		retrievalPending?: boolean;
		used: number;
	}

	let { limit, reserved, retrievalPending = false, used }: Props = $props();

	const format = new Intl.NumberFormat();

	let committed = $derived(used + reserved);
	let nearLimit = $derived(committed >= limit * 0.85);
	let atLimit = $derived(committed >= limit);
	let summary = $derived(
		`Context ${format.format(used)} of ${format.format(limit)} tokens, ${format.format(reserved)} reserved for the reply`
	);
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<span
				{...props}
				aria-label={summary}
				class={[
					'shrink-0 text-[11px] tabular-nums text-muted-foreground transition-colors',
					nearLimit && !atLimit && 'text-amber-600 dark:text-amber-400',
					atLimit && 'text-destructive'
				]}
			>
				{format.format(used)}/{format.format(limit)}
			</span>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>
		<span class="grid gap-0.5">
			<span>Estimated prompt: {format.format(used)} tokens</span>
			<span>Reserved for the reply: {format.format(reserved)} tokens</span>
			<span>Context window: {format.format(limit)} tokens</span>
			{#if retrievalPending}
				<span>Retrieved document context is added when you send.</span>
			{/if}
			{#if atLimit}
				<span>Over budget — the oldest history will be dropped to make room.</span>
			{:else if nearLimit}
				<span>Close to full — older history may be dropped.</span>
			{/if}
		</span>
	</Tooltip.Content>
</Tooltip.Root>
