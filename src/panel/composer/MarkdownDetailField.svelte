<script lang="ts">
  import { Component, MarkdownRenderer, type App } from "obsidian";
  import { onDestroy, onMount, tick } from "svelte";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import { wikiLinkSuggest } from "../wikiLinkInputSuggest";

  export let app: App;
  export let value = "";
  export let sourcePath = "";
  export let placeholder = "Markdown: **fett**, *kursiv*, - Listen, [[Links]]…";
  export let ariaLabel = "Erläuterung";
  export let rows = 5;
  export let showReise = false;
  export let reise = "";
  export let reiseOptions: string[] = [];
  export let reisePlaceholder = "Zuordnung zu einer Reise (optional)";
  export let reiseAriaLabel = "Zuordnung zu einer Reise (optional)";
  export let onReiseChange: (value: string) => void = () => {};
  export let onAddReiseOption: (value: string) => void = () => {};
  export let onHideReiseOption: (value: string) => void = () => {};
  export let onValueChange: (value: string) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  const reiseDatalistId = `udn-reise-toolbar-${Math.random().toString(36).slice(2, 9)}`;

  let reiseInputEl: HTMLInputElement | undefined;
  let reiseMenuAnchorEl: HTMLDivElement | undefined;
  let textareaEl: HTMLTextAreaElement | undefined;
  let previewEl: HTMLDivElement | undefined;
  let previewComponent: Component | null = null;
  let showPreview = false;
  let showReiseMenu = false;
  let draft = value;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  $: if (value !== draft && document.activeElement !== textareaEl) {
    draft = value;
  }

  onMount(() => {
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
  });

  onDestroy(() => {
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
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
    const selected = draft.slice(start, end);
    const next = draft.slice(0, start) + before + selected + after + draft.slice(end);
    const cursor = start + before.length + selected.length + after.length;
    applyEdit(next, cursor, cursor);
  }

  function prefixLines(prefix: string): void {
    if (!textareaEl) return;
    const start = textareaEl.selectionStart ?? 0;
    const end = textareaEl.selectionEnd ?? 0;
    const block = draft.slice(start, end);
    const lines = block.length > 0 ? block.split("\n") : [""];
    const formatted = lines.map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`)).join("\n");
    const next = draft.slice(0, start) + formatted + draft.slice(end);
    applyEdit(next, start, start + formatted.length);
  }

  function insertWikiLink(): void {
    if (!textareaEl) return;
    const start = textareaEl.selectionStart ?? 0;
    const end = textareaEl.selectionEnd ?? 0;
    const selected = draft.slice(start, end);
    const insertion = selected ? `[[${selected}]]` : "[[]]";
    const next = draft.slice(0, start) + insertion + draft.slice(end);
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

  function onReiseInput(ev: Event): void {
    onReiseChange((ev.currentTarget as HTMLInputElement).value.trim());
  }

  function clearReise(): void {
    onReiseChange("");
  }

  $: reiseTrimmed = reise.trim();
  $: reiseKnown = reiseOptions.some((o) => o.trim().toLowerCase() === reiseTrimmed.toLowerCase());

  function onDocumentPointerDown(ev: PointerEvent): void {
    if (!showReiseMenu || !reiseMenuAnchorEl) return;
    if (reiseMenuAnchorEl.contains(ev.target as Node)) return;
    showReiseMenu = false;
  }

  function toggleReiseMenu(ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    showReiseMenu = !showReiseMenu;
  }

  function selectReise(option: string): void {
    onReiseChange(option);
    showReiseMenu = false;
  }

  function removeReiseOption(option: string, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    onHideReiseOption(option);
  }

  function saveReiseOption(): void {
    if (!reiseTrimmed || reiseKnown) return;
    onAddReiseOption(reiseTrimmed);
  }
</script>

<div class="udn-markdownDetailField">
  <div class="udn-markdownDetailToolbar" role="toolbar" aria-label="Markdown formatieren">
    <button type="button" class={dk.btn} title="Fett" on:click={() => wrapSelection("**")} disabled={showPreview}>
      <strong>B</strong>
    </button>
    <button type="button" class={dk.btn} title="Kursiv" on:click={() => wrapSelection("*")} disabled={showPreview}>
      <em>I</em>
    </button>
    <button type="button" class={dk.btn} title="Liste" on:click={() => prefixLines("- ")} disabled={showPreview}>
      •
    </button>
    <button type="button" class={dk.btn} title="Wiki-Link" on:click={insertWikiLink} disabled={showPreview}>
      [[ ]]
    </button>
    {#if showReise}
      <div class="udn-markdownDetailReiseWrap" bind:this={reiseMenuAnchorEl}>
        <input
          bind:this={reiseInputEl}
          type="text"
          class="{dk.input} udn-markdownDetailToolbarReise udn-reisenReiseInput"
          value={reise}
          list={reiseDatalistId}
          placeholder={reisePlaceholder}
          on:input={onReiseInput}
          on:focus={focusTarget}
          aria-label={reiseAriaLabel}
        />
        <button
          type="button"
          class="{dk.btn} udn-markdownDetailReiseMenu"
          class:udn-markdownDetailReiseMenu--open={showReiseMenu}
          title="Reise wählen oder verwalten"
          aria-label="Reise wählen oder verwalten"
          aria-expanded={showReiseMenu}
          on:click={toggleReiseMenu}
        >▼</button>
        {#if reise.trim()}
          <button
            type="button"
            class="{dk.btn} udn-markdownDetailReiseClear"
            title="Reise-Zuordnung löschen"
            aria-label="Reise-Zuordnung löschen"
            on:click={clearReise}
          >×</button>
        {/if}
        {#if showReiseMenu}
          <div class="udn-reiseMenu" role="menu" aria-label="Gespeicherte Reisen">
            {#if reiseOptions.length === 0}
              <div class="udn-reiseMenuEmpty">Keine gespeicherten Reisen</div>
            {:else}
              {#each reiseOptions as option (option)}
                <div class="udn-reiseMenuRow" role="none">
                  <button
                    type="button"
                    class="udn-reiseMenuPick"
                    role="menuitem"
                    on:click={() => selectReise(option)}
                  >{option}</button>
                  <button
                    type="button"
                    class="udn-reiseMenuRemove"
                    title="Aus Liste entfernen"
                    aria-label="Aus Liste entfernen"
                    on:click={(ev) => removeReiseOption(option, ev)}
                  >×</button>
                </div>
              {/each}
            {/if}
            <div class="udn-reiseMenuFooter">
              <button
                type="button"
                class="{dk.btn} udn-reiseMenuSave"
                disabled={!reiseTrimmed || reiseKnown}
                on:click={saveReiseOption}
              >
                {reiseTrimmed ? `„${reiseTrimmed}" speichern` : "Neue Reise speichern…"}
              </button>
            </div>
          </div>
        {/if}
      </div>
      <datalist id={reiseDatalistId}>
        {#each reiseOptions as option (option)}
          <option value={option} />
        {/each}
      </datalist>
    {/if}
    <button
      type="button"
      class="{dk.btn} udn-markdownDetailPreviewToggle"
      class:udn-markdownDetailPreviewToggle--solo={!showReise}
      on:click={togglePreview}
    >
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
