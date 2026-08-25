<script lang="ts">
	import { DiagnosticsConsole } from '$lib/components/app/diagnostics';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';

	let showConsole = $state(false);
</script>

<section class="grid gap-3">
	<div class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5">
		<Checkbox
			aria-controls="settings-diagnostics-console"
			aria-expanded={showConsole}
			checked={showConsole}
			id="settings-show-diagnostics"
			onCheckedChange={(checked) => (showConsole = checked === true)}
		/>
		<div class="grid gap-0.5">
			<Label class="text-sm font-medium" for="settings-show-diagnostics">
				Show diagnostic console
			</Label>
			<p class="m-0 text-xs text-muted-foreground">
				Displays sanitized health information and operational events. Prompts, document content,
				paths, credentials, and raw provider errors are excluded.
			</p>
		</div>
	</div>

	{#if showConsole}
		<DiagnosticsConsole />
	{/if}
</section>
