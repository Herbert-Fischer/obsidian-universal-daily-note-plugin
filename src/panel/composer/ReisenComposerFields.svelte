<script lang="ts">
  import type { App } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import MarkdownDetailField from "./MarkdownDetailField.svelte";

  export let app: App;
  export let sourcePath = "";
  export let reise = "";
  export let detail = "";
  export let reiseOptions: string[] = [];
  export let onReiseChange: (value: string) => void = () => {};
  export let onDetailChange: (value: string) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  const NEW_REISE_VALUE = "__new__";
  let customReise = "";
  let selectValue = "";
  let pendingNewReise = false;

  $: {
    const trimmed = reise.trim();
    if (pendingNewReise || (trimmed && !reiseOptions.some((o) => o === trimmed))) {
      selectValue = NEW_REISE_VALUE;
      if (trimmed) customReise = trimmed;
    } else if (trimmed) {
      selectValue = trimmed;
      pendingNewReise = false;
    } else if (!pendingNewReise) {
      selectValue = "";
    }
  }

  function onSelectChange(ev: Event) {
    const value = (ev.currentTarget as HTMLSelectElement).value;
    if (value === NEW_REISE_VALUE) {
      pendingNewReise = true;
      selectValue = NEW_REISE_VALUE;
      onReiseChange(customReise.trim());
      return;
    }
    pendingNewReise = false;
    selectValue = value;
    onReiseChange(value);
  }

  function onCustomReiseInput(ev: Event) {
    customReise = (ev.currentTarget as HTMLInputElement).value;
    onReiseChange(customReise.trim());
  }

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-reisenForm">
  <div class="udn-reisenReiseRow">
    <span class="udn-reisenReiseLabel">Reise</span>
    <div class="udn-reisenReiseFields">
      <select
        class="{dk.input} udn-reisenReiseSelect"
        value={selectValue}
        on:change={onSelectChange}
        on:focus={focusTarget}
        aria-label="Reise zuordnen"
      >
        <option value="">— Reise wählen —</option>
        {#each reiseOptions as option (option)}
          <option value={option}>{option}</option>
        {/each}
        <option value={NEW_REISE_VALUE}>Neue Reise…</option>
      </select>
      {#if selectValue === NEW_REISE_VALUE}
        <input
          type="text"
          class="{dk.input} udn-reisenReiseSelect"
          value={customReise}
          placeholder="z. B. Mamas 90ter Geburtstag"
          on:input={onCustomReiseInput}
          on:focus={focusTarget}
          aria-label="Neue Reise"
        />
      {/if}
    </div>
  </div>

  <MarkdownDetailField
    {app}
    {sourcePath}
    value={detail}
    ariaLabel="Erläuterung"
    onValueChange={onDetailChange}
    onFocus={focusTarget}
  />
</div>
