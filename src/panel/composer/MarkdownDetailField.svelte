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
  export let showAssignment = false;
  export let assignment = "";
  export let assignmentOptions: string[] = [];
  export let assignmentPlaceholder = "Zuordnung (optional)";
  export let assignmentAriaLabel = "Zuordnung (optional)";
  export let assignmentMenuLabel = "Zuordnung wählen oder verwalten";
  export let onAssignmentChange: (value: string) => void = () => {};
  export let onAddAssignmentOption: (value: string) => void = () => {};
  export let onHideAssignmentOption: (value: string) => void = () => {};
  export let onValueChange: (value: string) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  const assignmentDatalistId = `udn-assignment-toolbar-${Math.random().toString(36).slice(2, 9)}`;

  let fieldRoot: HTMLDivElement | undefined;
  let assignmentInputEl: HTMLInputElement | undefined;
  let assignmentMenuAnchorEl: HTMLDivElement | undefined;
  let textareaEl: HTMLTextAreaElement | undefined;
  let previewEl: HTMLDivElement | undefined;
  let previewComponent: Component | null = null;
  let showPreview = false;
  let showAssignmentMenu = false;
  let draft = value;
  let savedSelectionStart = 0;
  let savedSelectionEnd = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function focusInsideField(): boolean {
    const active = document.activeElement;
    return Boolean(active && fieldRoot?.contains(active));
  }

  $: if (value !== draft && !focusInsideField()) {
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

  function rememberSelection(): void {
    if (!textareaEl) return;
    savedSelectionStart = textareaEl.selectionStart ?? 0;
    savedSelectionEnd = textareaEl.selectionEnd ?? 0;
  }

  function selectionRange(): [number, number] {
    if (document.activeElement === textareaEl && textareaEl) {
      return [textareaEl.selectionStart ?? 0, textareaEl.selectionEnd ?? 0];
    }
    return [savedSelectionStart, savedSelectionEnd];
  }

  function applyEdit(next: string, selectionStart: number, selectionEnd: number): void {
    draft = next;
    savedSelectionStart = selectionStart;
    savedSelectionEnd = selectionEnd;
    flushToParent();
    void tick().then(() => {
      textareaEl?.focus();
      textareaEl?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function stop(ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
  }

  function onToolbarPointerDown(ev: Event): void {
    stop(ev);
    rememberSelection();
  }

  function wrapSelection(before: string, after = before): void {
    const [start, end] = selectionRange();
    const selected = draft.slice(start, end);
    const next = draft.slice(0, start) + before + selected + after + draft.slice(end);
    const cursor = start + before.length + selected.length + after.length;
    applyEdit(next, cursor, cursor);
  }

  function prefixLines(prefix: string): void {
    const [start, end] = selectionRange();
    const block = draft.slice(start, end);
    const lines = block.length > 0 ? block.split("\n") : [""];
    const formatted = lines.map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`)).join("\n");
    const next = draft.slice(0, start) + formatted + draft.slice(end);
    applyEdit(next, start, start + formatted.length);
  }

  function insertWikiLink(): void {
    const [start, end] = selectionRange();
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
    rememberSelection();
    flushToParent();
  }

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }

  function onAssignmentInput(ev: Event): void {
    onAssignmentChange((ev.currentTarget as HTMLInputElement).value.trim());
  }

  function clearAssignment(): void {
    onAssignmentChange("");
  }

  $: assignmentTrimmed = assignment.trim();
  $: assignmentKnown = assignmentOptions.some((o) => o.trim().toLowerCase() === assignmentTrimmed.toLowerCase());

  function onDocumentPointerDown(ev: PointerEvent): void {
    if (!showAssignmentMenu || !assignmentMenuAnchorEl) return;
    if (assignmentMenuAnchorEl.contains(ev.target as Node)) return;
    showAssignmentMenu = false;
  }

  function toggleAssignmentMenu(ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    showAssignmentMenu = !showAssignmentMenu;
  }

  function selectAssignment(option: string): void {
    onAssignmentChange(option);
    showAssignmentMenu = false;
  }

  function removeAssignmentOption(option: string, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    onHideAssignmentOption(option);
  }

  function saveAssignmentOption(): void {
    if (!assignmentTrimmed || assignmentKnown) return;
    onAddAssignmentOption(assignmentTrimmed);
  }

  $: previewToggleSolo = !showAssignment && !$$slots.toolbarExtra;
</script>

<div class="udn-markdownDetailField" bind:this={fieldRoot}>
  <div class="udn-markdownDetailToolbar" role="toolbar" aria-label="Markdown formatieren">
    <button
      type="button"
      class={dk.btn}
      title="Fett"
      on:mousedown={onToolbarPointerDown}
      on:click={(ev) => {
        stop(ev);
        wrapSelection("**");
      }}
      disabled={showPreview}
    >
      <strong>B</strong>
    </button>
    <button
      type="button"
      class={dk.btn}
      title="Kursiv"
      on:mousedown={onToolbarPointerDown}
      on:click={(ev) => {
        stop(ev);
        wrapSelection("*");
      }}
      disabled={showPreview}
    >
      <em>I</em>
    </button>
    <button
      type="button"
      class={dk.btn}
      title="Liste"
      on:mousedown={onToolbarPointerDown}
      on:click={(ev) => {
        stop(ev);
        prefixLines("- ");
      }}
      disabled={showPreview}
    >
      •
    </button>
    <button
      type="button"
      class={dk.btn}
      title="Wiki-Link"
      on:mousedown={onToolbarPointerDown}
      on:click={(ev) => {
        stop(ev);
        insertWikiLink();
      }}
      disabled={showPreview}
    >
      [[ ]]
    </button>
    {#if $$slots.toolbarExtra}
      <div class="udn-markdownDetailToolbarExtra">
        <slot name="toolbarExtra" />
      </div>
    {/if}
    {#if showAssignment}
      <div class="udn-markdownDetailReiseWrap" bind:this={assignmentMenuAnchorEl}>
        <input
          bind:this={assignmentInputEl}
          type="text"
          class="{dk.input} udn-markdownDetailToolbarReise udn-reisenReiseInput"
          value={assignment}
          list={assignmentDatalistId}
          placeholder={assignmentPlaceholder}
          on:input={onAssignmentInput}
          on:focus={focusTarget}
          aria-label={assignmentAriaLabel}
        />
        <button
          type="button"
          class="{dk.btn} udn-markdownDetailReiseMenu"
          class:udn-markdownDetailReiseMenu--open={showAssignmentMenu}
          title={assignmentMenuLabel}
          aria-label={assignmentMenuLabel}
          aria-expanded={showAssignmentMenu}
          on:click={(ev) => {
            stop(ev);
            toggleAssignmentMenu(ev);
          }}
        >▼</button>
        {#if assignment.trim()}
          <button
            type="button"
            class="{dk.btn} udn-markdownDetailReiseClear"
            title="Zuordnung löschen"
            aria-label="Zuordnung löschen"
            on:click={(ev) => {
              stop(ev);
              clearAssignment();
            }}
          >×</button>
        {/if}
        {#if showAssignmentMenu}
          <div class="udn-reiseMenu" role="menu" aria-label={assignmentMenuLabel}>
            {#if assignmentOptions.length === 0}
              <div class="udn-reiseMenuEmpty">Keine gespeicherten Einträge</div>
            {:else}
              {#each assignmentOptions as option (option)}
                <div class="udn-reiseMenuRow" role="none">
                  <button
                    type="button"
                    class="udn-reiseMenuPick"
                    role="menuitem"
                    on:click={(ev) => {
                      stop(ev);
                      selectAssignment(option);
                    }}
                  >{option}</button>
                  <button
                    type="button"
                    class="udn-reiseMenuRemove"
                    title="Aus Liste entfernen"
                    aria-label="Aus Liste entfernen"
                    on:click={(ev) => {
                      stop(ev);
                      removeAssignmentOption(option, ev);
                    }}
                  >×</button>
                </div>
              {/each}
            {/if}
            <div class="udn-reiseMenuFooter">
              <button
                type="button"
                class="{dk.btn} udn-reiseMenuSave"
                disabled={!assignmentTrimmed || assignmentKnown}
                on:click={(ev) => {
                  stop(ev);
                  saveAssignmentOption();
                }}
              >
                {assignmentTrimmed ? `„${assignmentTrimmed}" speichern` : "Neuen Eintrag speichern…"}
              </button>
            </div>
          </div>
        {/if}
      </div>
      <datalist id={assignmentDatalistId}>
        {#each assignmentOptions as option (option)}
          <option value={option} />
        {/each}
      </datalist>
    {/if}
    <button
      type="button"
      class="{dk.btn} udn-markdownDetailPreviewToggle"
      class:udn-markdownDetailPreviewToggle--solo={previewToggleSolo}
      on:mousedown={onToolbarPointerDown}
      on:click={(ev) => {
        stop(ev);
        void togglePreview();
      }}
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
      on:select={rememberSelection}
      on:keyup={rememberSelection}
      on:click={rememberSelection}
    ></textarea>
  {/if}
</div>
