<script lang="ts">
  import type { App } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { TrackMatch } from "../../tracks/gpxImport";
  import type { TrackPickOption } from "../../tracks/trackPickModal";
  import MarkdownDetailField from "./MarkdownDetailField.svelte";
  import WandernMediaField from "./WandernMediaField.svelte";

  export let app: App;
  export let sourcePath = "";
  export let beschreibung = "";
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
  export let showReise = false;
  export let onReiseChange: (v: string) => void = () => {};
  export let onAddReiseOption: (v: string) => void = () => {};
  export let onHideReiseOption: (v: string) => void = () => {};
  export let onBeschreibungChange: (v: string) => void = () => {};
  export let onRemovePhoto: (index: number) => void = () => {};
  export let onMovePhotoUp: (index: number) => void = () => {};
  export let onMovePhotoDown: (index: number) => void = () => {};
  export let onAddPhotoClick: () => void = () => {};
  export let onPickTrackClick: () => void = () => {};
  export let onTrackOptionPick: (option: TrackPickOption) => void = () => {};
  export let onClearTrackClick: () => void = () => {};
  export let onTogglePreview: () => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-wandernForm">
  <MarkdownDetailField
    {app}
    {sourcePath}
    value={beschreibung}
    ariaLabel="Erläuterung"
    {showReise}
    {reise}
    {reiseOptions}
    onReiseChange={onReiseChange}
    onAddReiseOption={onAddReiseOption}
    onHideReiseOption={onHideReiseOption}
    onValueChange={onBeschreibungChange}
    onFocus={focusTarget}
  />

  <WandernMediaField
    {app}
    {track}
    {photos}
    {maxPhotos}
    {trackPickerOpen}
    {trackPickerLoading}
    {trackOptions}
    onPickTrackClick={onPickTrackClick}
    onTrackOptionPick={onTrackOptionPick}
    onClearTrackClick={onClearTrackClick}
    onAddPhotoClick={onAddPhotoClick}
    onRemovePhoto={onRemovePhoto}
    onMovePhotoUp={onMovePhotoUp}
    onMovePhotoDown={onMovePhotoDown}
    onFocus={focusTarget}
  />

  <div class="udn-wandernPreviewToggle">
    <button type="button" class={dk.btn} on:click={onTogglePreview}>
      {showPreview ? "Felder" : "Vorschau"}
    </button>
  </div>

  {#if showPreview}
    <pre class="udn-wandernPreview">{previewMarkdown || "(leer)"}</pre>
  {/if}
</div>
