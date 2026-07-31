<script lang="ts">
	import { buttonVariants, type ButtonSize, type ButtonVariant } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { cn } from '$lib/components/ui/utils';
	import { mergeProps } from 'bits-ui';
	import type { ComponentProps, Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props {
		children: Snippet;
		class?: string;
		disabled?: boolean;
		label: string;
		onclick?: HTMLButtonAttributes['onclick'];
		pressed?: boolean;
		size?: ButtonSize;
		triggerProps?: Record<string, unknown>;
		type?: HTMLButtonAttributes['type'];
		variant?: ButtonVariant;
	}

	let {
		children,
		class: className,
		disabled = false,
		label,
		onclick,
		pressed,
		size = 'icon',
		triggerProps = {},
		type = 'button',
		variant = 'outline'
	}: Props = $props();

	const triggerAttributes = $derived(
		mergeProps(triggerProps, {
			class: cn(buttonVariants({ size, variant }), 'cursor-pointer', className),
			disabled,
			onclick,
			type,
			'aria-label': label,
			'aria-pressed': pressed
		}) as ComponentProps<typeof Tooltip.Trigger>
	);
</script>

<Tooltip.Root>
	<Tooltip.Trigger {...triggerAttributes}>
		{@render children()}
	</Tooltip.Trigger>
	<Tooltip.Content>{label}</Tooltip.Content>
</Tooltip.Root>
