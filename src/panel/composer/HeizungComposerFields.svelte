<script lang="ts">
  import type { App } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import PhotoCollageField from "./PhotoCollageField.svelte";
  import MarkdownDetailField from "./MarkdownDetailField.svelte";

  export let app: App;
  export let sourcePath = "";
  export let vorfall = "";
  export let detail = "";
  export let photos: string[] = [];
  export let maxPhotos = 6;
  export let vorfallOptions: string[] = [];
  export let onVorfallChange: (value: string) => void = () => {};
  export let onDetailChange: (value: string) => void = () => {};
  export let onAddPhotoClick: () => void = () => {};
  export let onAddVaultPhotoClick: () => void = () => {};
  export let onRemovePhoto: (index: number) => void = () => {};
  export let onMovePhotoUp: (index: number) => void = () => {};
  export let onMovePhotoDown: (index: number) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  const NEW_VORFALL_VALUE = "__new__";
  let customVorfall = "";
  let selectValue = "";
  let pendingNewVorfall = false;

  $: {
    const trimmed = vorfall.trim();
    if (pendingNewVorfall || (trimmed && !vorfallOptions.some((o) => o === trimmed))) {
      selectValue = NEW_VORFALL_VALUE;
      if (trimmed) customVorfall = trimmed;
    } else if (trimmed) {
      selectValue = trimmed;
      pendingNewVorfall = false;
    } else if (!pendingNewVorfall) {
      selectValue = "";
    }
  }

  function onSelectChange(ev: Event) {
    const value = (ev.currentTarget as HTMLSelectElement).value;
    if (value === NEW_VORFALL_VALUE) {
      pendingNewVorfall = true;
      selectValue = NEW_VORFALL_VALUE;
      onVorfallChange(customVorfall.trim());
      return;
    }
    pendingNewVorfall = false;
    selectValue = value;
    onVorfallChange(value);
  }

  function onCustomVorfallInput(ev: Event) {
    customVorfall = (ev.currentTarget as HTMLInputElement).value;
    onVorfallChange(customVorfall.trim());
  }

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-reisenForm">
  <div class="udn-reisenReiseRow">
    <span class="udn-reisenReiseLabel">Vorfall</span>
    <div class="udn-reisenReiseFields">
      <select
        class="{dk.input} udn-reisenReiseSelect"
        value={selectValue}
        on:change={onSelectChange}
        on:focus={focusTarget}
        aria-label="Vorfall zuordnen"
      >
        <option value="">— Vorfall wählen —</option>
        {#each vorfallOptions as option (option)}
          <option value={option}>{option}</option>
        {/each}
        <option value={NEW_VORFALL_VALUE}>Neuer Vorfall…</option>
      </select>
      {#if selectValue === NEW_VORFALL_VALUE}
        <input
          type="text"
          class="{dk.input} udn-reisenReiseSelect"
          value={customVorfall}
          placeholder="z. B. Brennerausfall"
          on:input={onCustomVorfallInput}
          on:focus={focusTarget}
          aria-label="Neuer Vorfall"
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
    label="Fotos (im Heizungs-Callout)"
    showVaultPicker
    onAddPhotoClick={onAddPhotoClick}
    onAddVaultPhotoClick={onAddVaultPhotoClick}
    onRemovePhoto={onRemovePhoto}
    onMovePhotoUp={onMovePhotoUp}
    onMovePhotoDown={onMovePhotoDown}
  />
</div>
