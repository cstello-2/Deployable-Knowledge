<script lang="ts">
	import favicon from '$lib/assets/icon.svg';

	interface Props {
		ready?: boolean;
		version: string;
	}

	let { ready = false, version }: Props = $props();
</script>

<div
	class={[
		'fixed inset-0 z-[10000] grid place-items-center bg-background text-foreground transition-opacity duration-200',
		ready ? 'pointer-events-none opacity-0' : 'opacity-100'
	]}
	aria-hidden={ready}
	aria-label="Loading Deployable Knowledge"
	aria-live="polite"
	role="status"
>
	<div class="grid justify-items-center gap-3">
		<img class="size-24 drop-shadow-lg" src={favicon} alt="" />
		<div class="text-lg font-semibold tracking-tight">Deployable Knowledge</div>
		<div class="text-xs text-muted-foreground">Version {version}</div>
	</div>
</div>
