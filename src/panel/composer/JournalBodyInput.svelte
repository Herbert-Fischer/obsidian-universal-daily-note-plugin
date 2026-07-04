<script lang="ts">
  import { tick } from "svelte";
  import type { App } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { FeedProfile } from "../../notes/feedMetadata";
  import FeedLinkBubbleBody from "../FeedLinkBubbleBody.svelte";
  import { isWikiLinkSuggestOpen, wikiLinkSuggest } from "../wikiLinkInputSuggest";

  export let app: App;
  export let value = "";
  export let className = "";
  export let placeholder = "";
  export let ariaLabel = "Eintrag";
  export let sourcePath = "";
  export let feedProfile: FeedProfile | undefined = undefined;
  export let linkBubbles = false;
  export let onInput: (value: string) => void = () => {};
  export let onFocus: (ev: FocusEvent) => void = () => {};
  export let onKeydown: (ev: KeyboardEvent) => void = () => {};
  export let onOpenWikiLink: (dest: string, sourcePath: string) => void = () => {};

  let editing = false;
  let draft = value;
  let inputEl: HTMLInputElement | undefined;
  let applyingLink = false;

  $: hasWikiLinks = /\[\[[^\]|]+\]\]/.test(value);
  $: showInput = editing || !linkBubbles || !hasWikiLinks;
  $: if (!applyingLink && value !== draft && document.activeElement !== inputEl) {
    draft = value;
  }

  async function startEdit(ev?: Event) {
    if (editing) return;
    ev?.preventDefault();
    editing = true;
    draft = value;
    await tick();
    inputEl?.focus();
    if (inputEl) {
      const len = inputEl.value.length;
      inputEl.setSelectionRange(len, len);
    }
  }

  function onInputEdit() {
    if (applyingLink) return;
    onInput(draft);
  }

  function applyWikiLinkValue(next: string, cursor: number) {
    applyingLink = true;
    draft = next;
    onInput(next);
    void tick().then(() => {
      inputEl?.focus();
      inputEl?.setSelectionRange(cursor, cursor);
      applyingLink = false;
    });
  }

  function onBlurEdit() {
    if (applyingLink || isWikiLinkSuggestOpen()) return;
    if (hasWikiLinks) editing = false;
  }
</script>

{#if showInput}
  <input
    type="text"
    bind:this={inputEl}
    class="{dk.input} {className}"
    {placeholder}
    bind:value={draft}
    aria-label={ariaLabel}
    use:wikiLinkSuggest={{ app, sourcePath, onValueChange: applyWikiLinkValue }}
    on:focus={onFocus}
    on:input={onInputEdit}
    on:keydown={onKeydown}
    on:blur={onBlurEdit}
  />
{:else if linkBubbles}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <span title="Klicken zum Bearbeiten" on:click={startEdit}>
    <FeedLinkBubbleBody
      {app}
      text={value}
      {feedProfile}
      {sourcePath}
      className={className}
      onOpenWikiLink={onOpenWikiLink}
    />
  </span>
{:else}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <span
    class="udn-timelineEntryBody {className}"
    title="Klicken zum Bearbeiten"
    on:click={startEdit}
  >
    <FeedLinkBubbleBody
      {app}
      text={value}
      {feedProfile}
      {sourcePath}
      onOpenWikiLink={onOpenWikiLink}
    />
  </span>
{/if}
