<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';

	interface Props {
		cancelLabel?: string;
		confirmLabel?: string;
		description: string;
		onConfirm: () => Promise<void> | void;
		onOpenChange?: (open: boolean) => void;
		open: boolean;
		title?: string;
		variant?: 'default' | 'destructive';
	}

	let {
		cancelLabel = 'Cancel',
		confirmLabel = 'Continue',
		description,
		onConfirm,
		onOpenChange = () => {},
		open,
		title = 'Are you sure?',
		variant = 'destructive'
	}: Props = $props();
</script>

<AlertDialog.Root {open} {onOpenChange}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{cancelLabel}</AlertDialog.Cancel>
			<AlertDialog.Action
				class={variant === 'destructive' ? 'bg-destructive text-white hover:bg-destructive/90' : ''}
				onclick={onConfirm}
			>
				{confirmLabel}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
