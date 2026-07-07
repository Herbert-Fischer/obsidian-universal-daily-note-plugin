<script lang="ts">
  import type { App } from "obsidian";
  import MarkdownDetailField from "./MarkdownDetailField.svelte";
  import PhotoCollageField from "./PhotoCollageField.svelte";

  export let app: App;
  export let sourcePath = "";
  export let reise = "";
  export let detail = "";
  export let photos: string[] = [];
  export let maxPhotos = 3;
  export let reiseOptions: string[] = [];
  export let onReiseChange: (value: string) => void = () => {};
  export let onAddReiseOption: (value: string) => void = () => {};
  export let onHideReiseOption: (value: string) => void = () => {};
  export let onDetailChange: (value: string) => void = () => {};
  export let onAddPhotoClick: () => void = () => {};
  export let onAddVaultPhotoClick: () => void = () => {};
  export let onRemovePhoto: (index: number) => void = () => {};
  export let onMovePhotoUp: (index: number) => void = () => {};
  export let onMovePhotoDown: (index: number) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-reisenForm">
  <MarkdownDetailField
    {app}
    {sourcePath}
    value={detail}
    ariaLabel="Erläuterung"
    showReise={true}
    {reise}
    {reiseOptions}
    reisePlaceholder="Reise"
    reiseAriaLabel="Reise"
    onReiseChange={onReiseChange}
    onAddReiseOption={onAddReiseOption}
    onHideReiseOption={onHideReiseOption}
    onValueChange={onDetailChange}
    onFocus={focusTarget}
  />

  <PhotoCollageField
    {app}
    {photos}
    {maxPhotos}
    label="Fotos (im Reisen-Callout)"
    showVaultPicker
    onAddPhotoClick={onAddPhotoClick}
    onAddVaultPhotoClick={onAddVaultPhotoClick}
    onRemovePhoto={onRemovePhoto}
    onMovePhotoUp={onMovePhotoUp}
    onMovePhotoDown={onMovePhotoDown}
  />
</div>
