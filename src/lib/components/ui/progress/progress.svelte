<script lang="ts">
	import { cn } from '$lib/components/ui/utils';

	interface Props {
		class?: string;
		value?: number;
	}

	let { class: className, value = 0 }: Props = $props();
	let percent = $derived(Math.max(0, Math.min(100, value)));
</script>

<div
	class={cn('bg-primary/20 relative h-2 w-full overflow-hidden rounded-full', className)}
	role="progressbar"
	aria-valuemax="100"
	aria-valuemin="0"
	aria-valuenow={percent}
>
	<div
		class="bg-primary h-full transition-transform"
		style={`transform: translateX(-${100 - percent}%)`}
	></div>
</div>
