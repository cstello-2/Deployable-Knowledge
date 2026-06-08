<script lang="ts">
  import BaseWindow from "$lib/components/BaseWindow.svelte";
  import type { WindowInstanceProps } from "./index.ts";

  let {
    id,
    title,
    closable = false,
    collapsed = false,
    onToggleCollapse = () => {},
    onClose = () => {},
  }: WindowInstanceProps = $props();
</script>

<BaseWindow
  {id}
  {title}
  {closable}
  {collapsed}
  {onToggleCollapse}
  {onClose}
  contentLabel="Blank chat window"
></BaseWindow>

<style>
</style>
