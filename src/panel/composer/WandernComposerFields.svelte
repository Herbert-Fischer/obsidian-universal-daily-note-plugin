<script lang="ts">
  import type { App } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { TrackMatch } from "../../tracks/gpxImport";
  import { formatTrackSummary } from "../../tracks/gpxImport";
  import type { TrackPickOption } from "../../tracks/trackPickModal";
  import PhotoCollageField from "./PhotoCollageField.svelte";

  export let app: App;
  export let beschreibung = "";
  export let titel = "";
  export let track: TrackMatch | null = null;
  export let photos: string[] = [];
  export let trackPickerOpen = false;
  export let trackPickerLoading = false;
  export let trackOptions: TrackPickOption[] = [];
  export let previewMarkdown = "";
  export let showPreview = false;
  export let maxPhotos = 3;
  export let reise = "";
  export let reiseOptions: string[] = [];
  export let onReiseChange: (v: string) => void = () => {};
  export let onBeschreibungChange: (v: string) => void = () => {};
  export let onTitelChange: (v: string) => void = () => {};
  export let onRemovePhoto: (index: number) => void = () => {};
  export let onMovePhotoUp: (index: number) => void = () => {};
  export let onMovePhotoDown: (index: number) => void = () => {};
  export let onAddPhotoClick: () => void = () => {};
  export let onPickTrackClick: () => void = () => {};
  export let onTrackOptionPick: (option: TrackPickOption) => void = () => {};
  export let onClearTrackClick: () => void = () => {};
  export let onTogglePreview: () => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  function inputValue(ev: Event): string {
    return (ev.currentTarget as HTMLInputElement).value;
  }

  function textareaValue(ev: Event): string {
    return (ev.currentTarget as HTMLTextAreaElement).value;
  }

  function trackWikiLink(path: string): string {
    return `[[${path}|Track]]`;
  }

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }

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
</script>

<div class="udn-wandernForm">
  <div class="udn-reisenReiseRow udn-wandernReiseRow">
    <span class="udn-reisenReiseLabel">Reise (optional)</span>
    <div class="udn-reisenReiseFields">
      <select
        class="{dk.input} udn-reisenReiseSelect"
        value={selectValue}
        on:change={onSelectChange}
        on:focus={focusTarget}
        aria-label="Reise zuordnen"
      >
        <option value="">— keine Reise —</option>
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

  <label class="udn-composerSummary">
    <span class="udn-composerSummaryLabel">Titel / Callout</span>
    <input
      type="text"
      class="{dk.input} udn-composerSummaryInput"
      value={titel}
      on:input={(ev) => onTitelChange(inputValue(ev))}
      on:focus={focusTarget}
      placeholder="z. B. Wandern · Rhön"
    />
  </label>

  <label class="udn-composerSummary">
    <span class="udn-composerSummaryLabel">Beschreibung</span>
    <textarea
      class="{dk.input} udn-wandernTextarea"
      rows="4"
      value={beschreibung}
      on:input={(ev) => onBeschreibungChange(textareaValue(ev))}
      on:focus={focusTarget}
      placeholder="Ausführliche Beschreibung…"
    ></textarea>
  </label>

  <div class="udn-wandernTrack">
    <div class="udn-wandernPhotosHead">
      <span class="udn-composerSummaryLabel">GPX-Track</span>
      <button type="button" class={dk.btnSm} on:click={onPickTrackClick}>
        {trackPickerOpen ? "Auswahl schließen" : "Track wählen"}
      </button>
    </div>
    {#if trackPickerOpen}
      <div class="udn-wandernTrackPicker" role="listbox" aria-label="GPX-Track wählen">
        {#if trackPickerLoading}
          <p class="udn-wandernTrackPickerStatus">Tracks werden geladen…</p>
        {:else if trackOptions.length === 0}
          <p class="udn-wandernTrackPickerStatus">Keine GPX-Dateien gefunden.</p>
        {:else}
          {#each trackOptions as option (option.label + (option.track?.path ?? "none"))}
            <button
              type="button"
              class="udn-wandernTrackOption"
              class:udn-wandernTrackOption--active={option.track?.path === track?.path ||
                (!option.track && !track)}
              role="option"
              aria-selected={option.track?.path === track?.path || (!option.track && !track)}
              on:click={() => onTrackOptionPick(option)}
            >
              <span class="udn-wandernTrackOptionLabel">{option.label}</span>
              {#if option.hint}
                <span class="udn-wandernTrackOptionHint">{option.hint}</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    {/if}
    {#if track}
      <p class="udn-wandernTrackInfo">
        {formatTrackSummary(track)} · {trackWikiLink(track.path)}
      </p>
      <button type="button" class={dk.btnSm} on:click={onClearTrackClick}>Track entfernen</button>
    {:else}
      <p class="udn-wandernTrackEmpty">Kein Track zugeordnet — „Track wählen“ oder GPX mit Datum im Dateinamen.</p>
    {/if}
  </div>

  <PhotoCollageField
    {app}
    {photos}
    {maxPhotos}
    onAddPhotoClick={onAddPhotoClick}
    onRemovePhoto={onRemovePhoto}
    onMovePhotoUp={onMovePhotoUp}
    onMovePhotoDown={onMovePhotoDown}
  />

  <div class="udn-wandernPreviewToggle">
    <button type="button" class={dk.btnSm} on:click={onTogglePreview}>
      {showPreview ? "Felder" : "Vorschau"}
    </button>
  </div>

  {#if showPreview}
    <pre class="udn-wandernPreview">{previewMarkdown || "(leer)"}</pre>
  {/if}
</div>
