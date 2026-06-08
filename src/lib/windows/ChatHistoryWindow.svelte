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
  contentLabel="Chat History"
>
  <div class="form">
    <div class="list">
      <div class="list-item">
        <div class="document-row">
          <span class="li-title test">How do I stop bleeding and run away from the enemy and stop bleeding?How do I stop bleeding and run away from the enemy and stop bleeding?How do I stop bleeding and run away from the enemy and stop bleeding?How do I stop bleeding and run away from the enemy and stop bleeding?How do I stop bleeding and run away from the enemy and stop bleeding?</span>
          <span class="li-right test">2024-06-01 12:00:00</span>
        </div>
        <div class="li-actions">
          <button class="btn" type="button"> Rename </button>
          <button class="btn btn-danger" type="button"> Delete </button>
        </div>
      </div>
    </div>
  </div>
</BaseWindow>

<style>
.document-row {
  grid-template-columns: auto auto;
}
</style>