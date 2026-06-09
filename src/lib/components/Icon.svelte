<script lang="ts">
  type Props = {
    name: string;
    label?: string;
    size?: number;
    filled?: boolean;
  };

  let { name, label, size = 18, filled = true }: Props = $props();
</script>

<span
  class="material-symbols-rounded dk-icon"
  class:not-filled={!filled}
  style={`font-size: ${size}px`}
  aria-hidden={label ? undefined : "true"}
  aria-label={label}
  role={label ? "img" : undefined}
>
  {name}
</span>

<style>
  .dk-icon {
    width: 1em;
    height: 1em;
    overflow: hidden;
    flex: 0 0 auto;
    font-size: 18px;
    line-height: 1;
    text-transform: none;
    user-select: none;
    font-variation-settings:
      "FILL" 1,
      "wght" 400,
      "GRAD" 0,
      "opsz" 24;
  }

  .not-filled {
    font-variation-settings:
      "FILL" 0,
      "wght" 400,
      "GRAD" 0,
      "opsz" 24;
  }
</style>
