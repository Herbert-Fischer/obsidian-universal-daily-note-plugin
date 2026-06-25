<script lang="ts">
  import { tick } from "svelte";
  import type { App } from "obsidian";
  import { dk, sidebarPointerAction } from "@denkarium/obsidian-lib-ui";
  import { parseWikiLinks } from "../../notes/parseWikiLinks";
  import { wikiLinkSuggest } from "../wikiLinkInputSuggest";

  export let app: App;
  export let value = "";
  export let className = "";
  export let placeholder = "";
  export let ariaLabel = "Eintrag";
  export let sourcePath = "";
  export let onInput: (value: string) => void = () => {};
  export let onFocus: (ev: FocusEvent) => void = () => {};
  export let onKeydown: (ev: KeyboardEvent) => void = () => {};
  export let onOpenWikiLink: (dest: string, sourcePath: string) => void = () => {};

  let editing = false;
  let inputEl: HTMLInputElement | undefined;

  $: hasWikiLinks = /\[\[[^\]|]+\]\]/.test(value);
  $: showInput = editing || !hasWikiLinks;

  async function startEdit(ev?: Event) {
    if (editing) return;
    ev?.preventDefault();
    editing = true;
    await tick();
    inputEl?.focus();
    if (inputEl) {
      const len = inputEl.value.length;
      inputEl.setSelectionRange(len, len);
    }
  }

  function onInputEdit(ev: Event) {
    onInput((ev.currentTarget as HTMLInputElement).value);
  }

  function onBlurEdit() {
    if (hasWikiLinks) editing = false;
  }
</script>

{#if showInput}
  <input
    type="text"
    bind:this={inputEl}
    class="{dk.input} {className}"
    {placeholder}
    {value}
    aria-label={ariaLabel}
    use:wikiLinkSuggest={{ app, sourcePath }}
    on:focus={onFocus}
    on:input={onInputEdit}
    on:keydown={onKeydown}
    on:blur={onBlurEdit}
  />
{:else}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <span
    class="udn-timelineEntryBody {className}"
    title="Klicken zum Bearbeiten"
    on:click={startEdit}
  >
    {#each parseWikiLinks(value) as seg, i (i + seg.kind + (seg.kind === "link" ? seg.dest : seg.value))}
      {#if seg.kind === "link"}
        <a
          href="#"
          class="internal-link"
          use:sidebarPointerAction={() => onOpenWikiLink(seg.dest, sourcePath)}
        >{seg.label}</a>
      {:else}{seg.value}{/if}
    {/each}
  </span>
{/if}
