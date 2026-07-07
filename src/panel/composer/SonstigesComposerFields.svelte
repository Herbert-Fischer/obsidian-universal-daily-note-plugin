<script lang="ts">
  import type { App } from "obsidian";
  import MarkdownDetailField from "./MarkdownDetailField.svelte";

  export let app: App;
  export let sourcePath = "";
  export let detail = "";
  export let onDetailChange: (value: string) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-reisenForm udn-sonstigesForm">
  <MarkdownDetailField
    {app}
    {sourcePath}
    value={detail}
    ariaLabel="Erläuterung im Callout"
    placeholder="Markdown: **fett**, *kursiv*, - Listen, [[Links]]…"
    onValueChange={onDetailChange}
    onFocus={focusTarget}
  />
</div>
