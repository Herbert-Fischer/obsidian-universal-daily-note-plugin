<script lang="ts">
  import type { App } from "obsidian";
  import { TFile } from "obsidian";
  import { onDestroy } from "svelte";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { TrackMatch } from "../../tracks/gpxImport";
  import { formatTrackSummary } from "../../tracks/gpxImport";
  import { parseGpxTrackPoints } from "../../tracks/gpxImport";
  import type { TrackPickOption } from "../../tracks/trackPickModal";
  import { renderTrack3dCanvas } from "../../tracks/track3dView";

  export let app: App;
  export let track: TrackMatch | null = null;
  export let trackPickerOpen = false;
  export let trackPickerLoading = false;
  export let trackOptions: TrackPickOption[] = [];
  export let onPickTrackClick: () => void = () => {};
  export let onTrackOptionPick: (option: TrackPickOption) => void = () => {};
  export let onClearTrackClick: () => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  let previewCanvas: HTMLCanvasElement | undefined;
  let loadToken = 0;

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
      canvas.height = 96;
      renderTrack3dCanvas(canvas, points, { label: track?.name ?? path.split("/").pop() ?? "Track" });
    } catch {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-trackPreviewField">
  <div class="udn-wandernPhotosHead">
    <span class="udn-composerSummaryLabel">GPX-Track</span>
    <button type="button" class="{dk.btn} udn-trackPreviewToggle" class:udn-trackPreviewToggle--active={trackPickerOpen} on:click={onPickTrackClick}>
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
    <figure class="udn-trackPreviewStripItem">
      <canvas bind:this={previewCanvas} class="udn-trackPreviewCanvas" aria-label="GPX-Vorschau"></canvas>
      <figcaption class="udn-trackPreviewMeta">
        <span class="udn-trackPreviewSummary">{formatTrackSummary(track)}</span>
        <button type="button" class={dk.btn} on:click={onClearTrackClick}>Entfernen</button>
      </figcaption>
    </figure>
  {:else if !trackPickerOpen}
    <p class="udn-wandernTrackEmpty">Kein Track zugeordnet — „Track wählen“ oder GPX mit Datum im Dateinamen.</p>
  {/if}
</div>
