<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { WORKSPACE_WINDOW_IDS } from '$lib/constants';
	import { workspaceStore } from '$lib/stores';

	const visible = $derived(workspaceStore.isWindowVisible(WORKSPACE_WINDOW_IDS.DIAGNOSTICS));

	function setVisible(checked: boolean): void {
		if (checked) {
			workspaceStore.showWindow(WORKSPACE_WINDOW_IDS.DIAGNOSTICS);
		} else {
			workspaceStore.closeWindow(WORKSPACE_WINDOW_IDS.DIAGNOSTICS);
		}
	}
</script>

<section class="grid gap-3">
	<div class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5">
		<Checkbox
			checked={visible}
			id="settings-show-diagnostics"
			onCheckedChange={(checked) => setVisible(checked === true)}
		/>
		<div class="grid gap-0.5">
			<Label class="text-sm font-medium" for="settings-show-diagnostics">
				Show Diagnostics in this layout
			</Label>
			<p class="m-0 text-xs text-muted-foreground">
				Displays sanitized health information and operational events. Prompts, document content,
				paths, credentials, and raw provider errors are excluded.
			</p>
		</div>
	</div>
</section>
