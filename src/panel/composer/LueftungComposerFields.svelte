<script lang="ts">
  import type { App } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import PhotoCollageField from "./PhotoCollageField.svelte";
  import MarkdownDetailField from "./MarkdownDetailField.svelte";

  export let app: App;
  export let sourcePath = "";
  export let wartung = "";
  export let detail = "";
  export let photos: string[] = [];
  export let maxPhotos = 6;
  export let wartungOptions: string[] = [];
  export let onWartungChange: (value: string) => void = () => {};
  export let onDetailChange: (value: string) => void = () => {};
  export let onAddPhotoClick: () => void = () => {};
  export let onAddVaultPhotoClick: () => void = () => {};
  export let onRemovePhoto: (index: number) => void = () => {};
  export let onMovePhotoUp: (index: number) => void = () => {};
  export let onMovePhotoDown: (index: number) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  const NEW_WARTUNG_VALUE = "__new__";
  let customWartung = "";
  let selectValue = "";
  let pendingNewWartung = false;

  $: {
    const trimmed = wartung.trim();
    if (pendingNewWartung || (trimmed && !wartungOptions.some((o) => o === trimmed))) {
      selectValue = NEW_WARTUNG_VALUE;
      if (trimmed) customWartung = trimmed;
    } else if (trimmed) {
      selectValue = trimmed;
      pendingNewWartung = false;
    } else if (!pendingNewWartung) {
      selectValue = "";
    }
  }

  function onSelectChange(ev: Event) {
    const value = (ev.currentTarget as HTMLSelectElement).value;
    if (value === NEW_WARTUNG_VALUE) {
      pendingNewWartung = true;
      selectValue = NEW_WARTUNG_VALUE;
      onWartungChange(customWartung.trim());
      return;
    }
    pendingNewWartung = false;
    selectValue = value;
    onWartungChange(value);
  }

  function onCustomWartungInput(ev: Event) {
    customWartung = (ev.currentTarget as HTMLInputElement).value;
    onWartungChange(customWartung.trim());
  }

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-reisenForm">
  <div class="udn-reisenReiseRow">
    <span class="udn-reisenReiseLabel">Wartung</span>
    <div class="udn-reisenReiseFields">
      <select
        class="{dk.input} udn-reisenReiseSelect"
        value={selectValue}
        on:change={onSelectChange}
        on:focus={focusTarget}
        aria-label="Wartung zuordnen"
      >
        <option value="">— Wartung wählen —</option>
        {#each wartungOptions as option (option)}
          <option value={option}>{option}</option>
        {/each}
        <option value={NEW_WARTUNG_VALUE}>Neue Wartung…</option>
      </select>
      {#if selectValue === NEW_WARTUNG_VALUE}
        <input
          type="text"
          class="{dk.input} udn-reisenReiseSelect"
          value={customWartung}
          placeholder="z. B. Filterwechsel 2026"
          on:input={onCustomWartungInput}
          on:focus={focusTarget}
          aria-label="Neue Wartung"
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

  <PhotoCollageField
    {app}
    {photos}
    {maxPhotos}
    label="Fotos (im Lüftungs-Callout)"
    showVaultPicker
    onAddPhotoClick={onAddPhotoClick}
    onAddVaultPhotoClick={onAddVaultPhotoClick}
    onRemovePhoto={onRemovePhoto}
    onMovePhotoUp={onMovePhotoUp}
    onMovePhotoDown={onMovePhotoDown}
  />
</div>
