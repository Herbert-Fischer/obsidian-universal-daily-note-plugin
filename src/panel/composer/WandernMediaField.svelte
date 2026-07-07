<script lang="ts">
  import type { App } from "obsidian";
  import { TFile } from "obsidian";
  import { onDestroy } from "svelte";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import { stripPhotoEmbed } from "../../notes/photoCollage";
  import { openPhotoLightbox } from "../../photos/photoLightbox";
  import type { TrackMatch } from "../../tracks/gpxImport";
  import { formatTrackSummary, parseGpxTrackPoints } from "../../tracks/gpxImport";
  import type { TrackPickOption } from "../../tracks/trackPickModal";
  import { renderTrack3dCanvas } from "../../tracks/track3dView";

  export let app: App;
  export let track: TrackMatch | null = null;
  export let photos: string[] = [];
  export let maxPhotos = 3;
  export let trackPickerOpen = false;
  export let trackPickerLoading = false;
  export let trackOptions: TrackPickOption[] = [];
  export let onPickTrackClick: () => void = () => {};
  export let onTrackOptionPick: (option: TrackPickOption) => void = () => {};
  export let onClearTrackClick: () => void = () => {};
  export let onAddPhotoClick: () => void = () => {};
  export let onRemovePhoto: (index: number) => void = () => {};
  export let onMovePhotoUp: (index: number) => void = () => {};
  export let onMovePhotoDown: (index: number) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  let previewCanvas: HTMLCanvasElement | undefined;
  let loadToken = 0;

  $: thumbUrls = photos.map((path) => {
    const file = app.vault.getAbstractFileByPath(stripPhotoEmbed(path));
    return file instanceof TFile ? app.vault.getResourcePath(file) : "";
  });

  $: hasMedia = Boolean(track) || photos.length > 0;

  $: if (previewCanvas && track?.path) {
    void renderPreview(track.path);
  }

  onDestroy(() => {
    loadToken++;
  });

  async function renderPreview(path: string): Promise<void> {
    const token = ++loadToken;
    const canvas = previewCanvas;
    if (!canvas) return;
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    try {
      const xml = await app.vault.read(file);
      const points = parseGpxTrackPoints(xml);
      if (token !== loadToken) return;
      canvas.width = 280;
      canvas.height = 120;
      renderTrack3dCanvas(canvas, points, { label: track?.name ?? path.split("/").pop() ?? "Track" });
    } catch {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function openPhotoAt(index: number): void {
    const urls: string[] = [];
    let urlIndex = 0;
    for (let i = 0; i < photos.length; i++) {
      const url = thumbUrls[i];
      if (!url) continue;
      if (i === index) urlIndex = urls.length;
      urls.push(url);
    }
    if (urls.length === 0) return;
    openPhotoLightbox(urls, urlIndex);
  }

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-wandernMediaField">
  <div class="udn-wandernPhotosHead">
    <span class="udn-composerSummaryLabel">
      Anhänge
      {#if track}
        · GPX
      {/if}
      {#if photos.length > 0}
        · {photos.length}/{maxPhotos} Fotos
      {/if}
    </span>
    <div class="udn-wandernPhotosHeadActions">
      <button
        type="button"
        class="{dk.btn} udn-trackPreviewToggle"
        class:udn-trackPreviewToggle--active={trackPickerOpen}
        on:click={onPickTrackClick}
        on:focus={focusTarget}
      >
        {trackPickerOpen ? "Track schließen" : track ? "Track wechseln" : "Track wählen"}
      </button>
      <button
        type="button"
        class={dk.btn}
        disabled={photos.length >= maxPhotos}
        on:click={onAddPhotoClick}
        on:focus={focusTarget}
      >
        Fotos hinzufügen
      </button>
    </div>
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

  <div class="udn-wandernMediaStrip" aria-label="GPX-Track und Fotos">
    {#if track}
      <figure class="udn-photoStripItem udn-wandernMediaStripTrack">
        <canvas bind:this={previewCanvas} class="udn-wandernMediaStripTrackCanvas" aria-label="GPX-Vorschau"></canvas>
        <figcaption class="udn-photoStripActions">
          <span class="udn-trackPreviewSummary" title={formatTrackSummary(track)}>{formatTrackSummary(track)}</span>
          <button type="button" class={dk.btn} on:click={onClearTrackClick}>Entfernen</button>
        </figcaption>
      </figure>
    {/if}

    {#each photos as photo, index (photo + index)}
      <figure class="udn-photoStripItem">
        {#if thumbUrls[index]}
          <button
            type="button"
            class="udn-photoStripImageBtn"
            on:click={() => openPhotoAt(index)}
            aria-label="Bild vergrößern"
          >
            <img src={thumbUrls[index]} alt={stripPhotoEmbed(photo)} loading="lazy" />
          </button>
        {:else}
          <span class="udn-wandernPhotoPath">{stripPhotoEmbed(photo)}</span>
        {/if}
        <figcaption class="udn-photoStripActions">
          <button type="button" class={dk.btn} disabled={index === 0} on:click={() => onMovePhotoUp(index)} aria-label="Nach links">←</button>
          <button type="button" class={dk.btn} on:click={() => onRemovePhoto(index)}>Entfernen</button>
          <button type="button" class={dk.btn} disabled={index >= photos.length - 1} on:click={() => onMovePhotoDown(index)} aria-label="Nach rechts">→</button>
        </figcaption>
      </figure>
    {/each}
  </div>

  {#if !hasMedia && !trackPickerOpen}
    <p class="udn-wandernTrackEmpty">Noch kein GPX-Track und keine Fotos — oben hinzufügen.</p>
  {/if}
</div>
