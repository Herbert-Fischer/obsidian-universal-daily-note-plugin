<script lang="ts">
  import type { App } from "obsidian";
  import { TFile } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import { stripPhotoEmbed } from "../../notes/photoCollage";
  import { openPhotoLightbox } from "../../photos/photoLightbox";

  export let app: App;
  export let photos: string[] = [];
  export let maxPhotos = 6;
  export let label = "";
  export let showVaultPicker = false;
  export let onAddPhotoClick: () => void = () => {};
  export let onAddVaultPhotoClick: () => void = () => {};
  export let onRemovePhoto: (index: number) => void = () => {};
  export let onMovePhotoUp: (index: number) => void = () => {};
  export let onMovePhotoDown: (index: number) => void = () => {};

  $: thumbUrls = photos.map((path) => {
    const file = app.vault.getAbstractFileByPath(stripPhotoEmbed(path));
    return file instanceof TFile ? app.vault.getResourcePath(file) : "";
  });

  function openAt(index: number): void {
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
</script>

<div class="udn-photoCollageField">
  <div class="udn-wandernPhotosHead">
    <span class="udn-composerSummaryLabel">{label || `Fotos (${photos.length}/${maxPhotos})`}</span>
    <div class="udn-wandernPhotosHeadActions">
      <button type="button" class={dk.btnSm} disabled={photos.length >= maxPhotos} on:click={onAddPhotoClick}>
        Fotos hinzufügen
      </button>
      {#if showVaultPicker}
        <button
          type="button"
          class={dk.btnSm}
          disabled={photos.length >= maxPhotos}
          on:click={onAddVaultPhotoClick}
        >
          Aus Vault
        </button>
      {/if}
    </div>
  </div>

  {#if photos.length === 0}
    <p class="udn-wandernTrackPickerStatus">Noch keine Fotos.</p>
  {:else}
    <div class="udn-photoStrip" aria-label="Foto-Reihe">
      {#each photos as photo, index (photo + index)}
        <figure class="udn-photoStripItem">
          {#if thumbUrls[index]}
            <button type="button" class="udn-photoStripImageBtn" on:click={() => openAt(index)} aria-label="Bild vergrößern">
              <img src={thumbUrls[index]} alt={stripPhotoEmbed(photo)} loading="lazy" />
            </button>
          {:else}
            <span class="udn-wandernPhotoPath">{stripPhotoEmbed(photo)}</span>
          {/if}
          <figcaption class="udn-photoStripActions">
            <button type="button" class={dk.btnSm} disabled={index === 0} on:click={() => onMovePhotoUp(index)} aria-label="Nach links">←</button>
            <button type="button" class={dk.btnSm} on:click={() => onRemovePhoto(index)}>Entfernen</button>
            <button type="button" class={dk.btnSm} disabled={index >= photos.length - 1} on:click={() => onMovePhotoDown(index)} aria-label="Nach rechts">→</button>
          </figcaption>
        </figure>
      {/each}
    </div>
  {/if}
</div>
