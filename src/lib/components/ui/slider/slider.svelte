<script lang="ts">
	import { Slider as SliderPrimitive } from 'bits-ui';
	import { cn } from '$lib/components/ui/utils';

	interface Props {
		class?: string;
		disabled?: boolean;
		max?: number;
		min?: number;
		onValueChange?: (value: number) => void;
		step?: number;
		value?: number;
	}

	let {
		class: className,
		disabled = false,
		max = 100,
		min = 0,
		onValueChange,
		step = 1,
		value = $bindable(0)
	}: Props = $props();
</script>

<SliderPrimitive.Root
	type="single"
	bind:value
	{disabled}
	{max}
	{min}
	{onValueChange}
	{step}
	class={cn('relative flex w-full touch-none items-center select-none', className)}
>
	{#snippet children({ thumbs })}
		<span class="relative h-2 w-full grow overflow-hidden rounded-full bg-primary/20">
			<SliderPrimitive.Range class="absolute h-full bg-primary" />
		</span>
		{#each thumbs as index (index)}
			<SliderPrimitive.Thumb
				{index}
				class="block size-4 rounded-full border-2 border-primary bg-background shadow transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
			/>
		{/each}
	{/snippet}
</SliderPrimitive.Root>
