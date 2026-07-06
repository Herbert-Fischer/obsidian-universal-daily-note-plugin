<script lang="ts">
  import { Component, MarkdownRenderer, type App } from "obsidian";
  import { onDestroy, tick } from "svelte";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import { wikiLinkSuggest } from "../wikiLinkInputSuggest";

  export let app: App;
  export let value = "";
  export let sourcePath = "";
  export let placeholder = "Markdown: **fett**, *kursiv*, - Listen, [[Links]]…";
  export let ariaLabel = "Erläuterung";
  export let rows = 5;
  export let onValueChange: (value: string) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  let textareaEl: HTMLTextAreaElement | undefined;
  let previewEl: HTMLDivElement | undefined;
  let previewComponent: Component | null = null;
  let showPreview = false;
  let draft = value;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  $: if (value !== draft && document.activeElement !== textareaEl) {
    draft = value;
  }

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    previewComponent?.unload();
    previewComponent = null;
  });

  function flushToParent(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (draft !== value) onValueChange(draft);
  }

  function scheduleParentSync(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (draft !== value) onValueChange(draft);
    }, 120);
  }

  $: if (showPreview && previewEl) {
    void renderPreview(draft);
  }

  async function renderPreview(markdown: string): Promise<void> {
    if (!previewEl) return;
    previewComponent?.unload();
    previewComponent = new Component();
    previewEl.empty();
    await MarkdownRenderer.renderMarkdown(markdown, previewEl, sourcePath, previewComponent);
  }

  async function togglePreview(): Promise<void> {
    showPreview = !showPreview;
    if (showPreview) {
      flushToParent();
      await tick();
      await renderPreview(draft);
    }
  }

  function applyEdit(next: string, selectionStart: number, selectionEnd: number): void {
    draft = next;
    scheduleParentSync();
    void tick().then(() => {
      textareaEl?.focus();
      textareaEl?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function wrapSelection(before: string, after = before): void {
    if (!textareaEl) return;
    const start = textareaEl.selectionStart ?? 0;
    const end = textareaEl.selectionEnd ?? 0;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    const cursor = start + before.length + selected.length + after.length;
    applyEdit(next, cursor, cursor);
  }

  function prefixLines(prefix: string): void {
    if (!textareaEl) return;
    const start = textareaEl.selectionStart ?? 0;
    const end = textareaEl.selectionEnd ?? 0;
    const block = value.slice(start, end);
    const lines = block.length > 0 ? block.split("\n") : [""];
    const formatted = lines.map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`)).join("\n");
    const next = value.slice(0, start) + formatted + value.slice(end);
    applyEdit(next, start, start + formatted.length);
  }

  function insertWikiLink(): void {
    if (!textareaEl) return;
    const start = textareaEl.selectionStart ?? 0;
    const end = textareaEl.selectionEnd ?? 0;
    const selected = value.slice(start, end);
    const insertion = selected ? `[[${selected}]]` : "[[]]";
    const next = value.slice(0, start) + insertion + value.slice(end);
    const cursor = selected ? start + insertion.length : start + 2;
    applyEdit(next, cursor, cursor);
  }

  function onInput(ev: Event): void {
    draft = (ev.currentTarget as HTMLTextAreaElement).value;
    scheduleParentSync();
  }

  function onWikiValueChange(next: string, cursor: number): void {
    draft = next;
    scheduleParentSync();
    void tick().then(() => {
      textareaEl?.focus();
      textareaEl?.setSelectionRange(cursor, cursor);
    });
  }

  function onBlur(): void {
    flushToParent();
  }

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-markdownDetailField">
  <div class="udn-markdownDetailToolbar" role="toolbar" aria-label="Markdown formatieren">
    <button type="button" class={dk.btnSm} title="Fett" on:click={() => wrapSelection("**")} disabled={showPreview}>
      <strong>B</strong>
    </button>
    <button type="button" class={dk.btnSm} title="Kursiv" on:click={() => wrapSelection("*")} disabled={showPreview}>
      <em>I</em>
    </button>
    <button type="button" class={dk.btnSm} title="Liste" on:click={() => prefixLines("- ")} disabled={showPreview}>
      •
    </button>
    <button type="button" class={dk.btnSm} title="Wiki-Link" on:click={insertWikiLink} disabled={showPreview}>
      [[ ]]
    </button>
    <button type="button" class="{dk.btnSm} udn-markdownDetailPreviewToggle" on:click={togglePreview}>
      {showPreview ? "Bearbeiten" : "Vorschau"}
    </button>
  </div>

  {#if showPreview}
    <div class="udn-markdownDetailPreview markdown-preview-view" bind:this={previewEl} aria-label="{ariaLabel} Vorschau"></div>
  {:else}
    <textarea
      bind:this={textareaEl}
      class="{dk.textarea} udn-reisenDetailInput udn-markdownDetailInput"
      {rows}
      bind:value={draft}
      {placeholder}
      aria-label={ariaLabel}
      use:wikiLinkSuggest={{ app, sourcePath, onValueChange: onWikiValueChange }}
      on:input={onInput}
      on:focus={focusTarget}
      on:blur={onBlur}
    ></textarea>
  {/if}
</div>
