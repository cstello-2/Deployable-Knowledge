<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { documentTagHue } from '$lib/utils';

	interface Props {
		onDelete?: () => void;
		onToggle: () => void;
		selected?: boolean;
		tag: string;
	}

	let { onDelete, onToggle, selected = false, tag }: Props = $props();
</script>

<div
	class={[
		'dk-tag inline-flex h-7 items-center overflow-hidden rounded-full border text-xs font-medium whitespace-nowrap transition-[background-color,border-color]',
		selected && 'dk-tag-selected'
	]}
	style:--tag-hue={documentTagHue(tag)}
>
	<button
		aria-pressed={selected}
		class="inline-flex h-full items-center px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
		onclick={onToggle}
		type="button"
	>
		<span>#{tag}</span>
	</button>
	{#if onDelete}
		<button
			aria-label={`Delete #${tag}`}
			class="mr-0.5 grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
			onclick={(event) => {
				event.stopPropagation();
				onDelete();
			}}
			type="button"
		>
			<X class="size-3" />
		</button>
	{/if}
</div>
