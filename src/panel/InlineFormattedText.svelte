<script lang="ts">
  import { parseInlineMarkdown } from "../notes/inlineMarkdown";

  export let text = "";

  $: segments = parseInlineMarkdown(text);
</script>

<span class="udn-inlineMarkdown">
  {#each segments as seg, i (i + seg.kind + ("value" in seg ? seg.value : ""))}
    {#if seg.kind === "text"}
      {seg.value}
    {:else if seg.kind === "strong"}
      <strong>{seg.value}</strong>
    {:else if seg.kind === "em"}
      <em>{seg.value}</em>
    {:else if seg.kind === "del"}
      <del>{seg.value}</del>
    {:else if seg.kind === "code"}
      <code>{seg.value}</code>
    {:else if seg.kind === "mark"}
      <mark>{seg.value}</mark>
    {/if}
  {/each}
</span>
