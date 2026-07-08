<script lang="ts">
  import type { App } from "obsidian";
  import PhotoCollageField from "./PhotoCollageField.svelte";
  import MarkdownDetailField from "./MarkdownDetailField.svelte";

  export let app: App;
  export let sourcePath = "";
  export let vorfall = "";
  export let detail = "";
  export let photos: string[] = [];
  export let maxPhotos = 6;
  export let vorfallOptions: string[] = [];
  export let onAddVorfallOption: (value: string) => void = () => {};
  export let onHideVorfallOption: (value: string) => void = () => {};
  export let onVorfallChange: (value: string) => void = () => {};
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
    assignment={vorfall}
    assignmentOptions={vorfallOptions}
    assignmentPlaceholder="Vorfall / Projekt (optional)"
    assignmentAriaLabel="Vorfall / Projekt zuordnen"
    assignmentMenuLabel="Vorfall wählen oder verwalten"
    onAssignmentChange={onVorfallChange}
    onAddAssignmentOption={onAddVorfallOption}
    onHideAssignmentOption={onHideVorfallOption}
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
