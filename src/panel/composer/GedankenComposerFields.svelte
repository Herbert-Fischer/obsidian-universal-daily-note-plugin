<script lang="ts">
  import type { App } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import MarkdownDetailField from "./MarkdownDetailField.svelte";

  export let app: App;
  export let sourcePath = "";
  export let thema = "";
  export let detail = "";
  export let themaOptions: string[] = [];
  export let onThemaChange: (value: string) => void = () => {};
  export let onDetailChange: (value: string) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  const NEW_THEMA_VALUE = "__new__";
  let customThema = "";
  let selectValue = "";
  let pendingNewThema = false;

  $: {
    const trimmed = thema.trim();
    if (pendingNewThema || (trimmed && !themaOptions.some((o) => o === trimmed))) {
      selectValue = NEW_THEMA_VALUE;
      if (trimmed) customThema = trimmed;
    } else if (trimmed) {
      selectValue = trimmed;
      pendingNewThema = false;
    } else if (!pendingNewThema) {
      selectValue = "";
    }
  }

  function onSelectChange(ev: Event) {
    const value = (ev.currentTarget as HTMLSelectElement).value;
    if (value === NEW_THEMA_VALUE) {
      pendingNewThema = true;
      selectValue = NEW_THEMA_VALUE;
      onThemaChange(customThema.trim());
      return;
    }
    pendingNewThema = false;
    selectValue = value;
    onThemaChange(value);
  }

  function onCustomThemaInput(ev: Event) {
    customThema = (ev.currentTarget as HTMLInputElement).value;
    onThemaChange(customThema.trim());
  }

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-reisenForm">
  <div class="udn-reisenReiseRow">
    <span class="udn-reisenReiseLabel">Thema</span>
    <div class="udn-reisenReiseFields">
      <select
        class="{dk.input} udn-reisenReiseSelect"
        value={selectValue}
        on:change={onSelectChange}
        on:focus={focusTarget}
        aria-label="Thema zuordnen"
      >
        <option value="">— Thema wählen —</option>
        {#each themaOptions as option (option)}
          <option value={option}>{option}</option>
        {/each}
        <option value={NEW_THEMA_VALUE}>Neues Thema…</option>
      </select>
      {#if selectValue === NEW_THEMA_VALUE}
        <input
          type="text"
          class="{dk.input} udn-reisenReiseSelect"
          value={customThema}
          placeholder="z. B. Obsidian, Haushalt"
          on:input={onCustomThemaInput}
          on:focus={focusTarget}
          aria-label="Neues Thema"
        />
      {/if}
    </div>
  </div>

  <MarkdownDetailField
    {app}
    {sourcePath}
    value={detail}
    ariaLabel="Erläuterung"
    placeholder="Markdown: **fett**, *kursiv*, - Listen, [[Links]]…"
    onValueChange={onDetailChange}
    onFocus={focusTarget}
  />
</div>
