<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Circle from '@lucide/svelte/icons/circle';
	import { cn } from '$lib/components/ui/utils';
	import type { AgentGoal } from '$lib/types';

	interface Props {
		goals: AgentGoal[];
	}

	let { goals }: Props = $props();

	let expanded = $state(false);

	const doneCount = $derived(goals.filter(({ done }) => done).length);
	const activeGoal = $derived(goals.find(({ done }) => !done) ?? null);
</script>

{#if goals.length}
	<div class="dk-panel mx-2 mt-1 shrink-0 rounded-xl border bg-card/90 shadow-sm">
		<button
			type="button"
			class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left"
			aria-expanded={expanded}
			onclick={() => (expanded = !expanded)}
		>
			<span class="shrink-0 text-[11px] font-semibold text-muted-foreground">
				Goals · {doneCount}/{goals.length}
			</span>
			{#if expanded}
				<span class="min-w-0 flex-1"></span>
			{:else}
				<span class="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
					{#if activeGoal}
						<Circle class="size-3 shrink-0 text-muted-foreground/60" />
						<span class="truncate">{activeGoal.text}</span>
					{:else}
						<CircleCheck class="size-3 shrink-0 text-primary" />
						<span class="truncate text-muted-foreground">All goals complete</span>
					{/if}
				</span>
			{/if}
			<ChevronDown
				class={cn(
					'size-3.5 shrink-0 text-muted-foreground transition-transform',
					expanded && 'rotate-180'
				)}
			/>
		</button>
		{#if expanded}
			<ul
				class="m-0 grid max-h-40 list-none gap-1 overflow-x-hidden overflow-y-auto px-3 pt-0 pb-2"
			>
				{#each goals as goal, index (index)}
					<li class="flex items-start gap-1.5 text-xs">
						{#if goal.done}
							<CircleCheck class="mt-0.5 size-3.5 shrink-0 text-primary" />
						{:else}
							<Circle class="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
						{/if}
						<div class="min-w-0 flex-1">
							<span class={`break-words ${goal.done ? 'text-muted-foreground line-through' : ''}`}>
								{goal.text}
							</span>
							{#if goal.answer}
								<p class="m-0 text-[11px] break-words text-muted-foreground">
									{goal.answer}
								</p>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
