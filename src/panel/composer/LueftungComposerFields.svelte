<script lang="ts">
  import type { App } from "obsidian";
  import PhotoCollageField from "./PhotoCollageField.svelte";
  import MarkdownDetailField from "./MarkdownDetailField.svelte";

  export let app: App;
  export let sourcePath = "";
  export let wartung = "";
  export let detail = "";
  export let photos: string[] = [];
  export let maxPhotos = 6;
  export let wartungOptions: string[] = [];
  export let onAddWartungOption: (value: string) => void = () => {};
  export let onHideWartungOption: (value: string) => void = () => {};
  export let onWartungChange: (value: string) => void = () => {};
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
    placeholder="Markdown: **fett**, *kursiv*, - Listen, [[Links]]…"
    showAssignment={true}
    assignment={wartung}
    assignmentOptions={wartungOptions}
    assignmentPlaceholder="Wartung / Projekt (optional)"
    assignmentAriaLabel="Wartung / Projekt zuordnen"
    assignmentMenuLabel="Wartung wählen oder verwalten"
    onAssignmentChange={onWartungChange}
    onAddAssignmentOption={onAddWartungOption}
    onHideAssignmentOption={onHideWartungOption}
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
