<script lang="ts">
  import type { App } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { FeedProfile } from "../../notes/feedMetadata";
  import JournalBodyInput from "./JournalBodyInput.svelte";
  import PhotoCollageField from "./PhotoCollageField.svelte";

  export let app: App;
  export let sourcePath = "";
  export let feedText = "";
  export let feedLinks = "";
  export let detail = "";
  export let feedTime = "";
  export let photos: string[] = [];
  export let maxPhotos = 6;
  export let profileLabel = "";
  export let feedProfile: FeedProfile | undefined = undefined;
  export let onFeedTextChange: (v: string) => void = () => {};
  export let onFeedLinksChange: (v: string) => void = () => {};
  export let onDetailChange: (v: string) => void = () => {};
  export let onFeedTimeChange: (v: string) => void = () => {};
  export let onRemovePhoto: (index: number) => void = () => {};
  export let onMovePhotoUp: (index: number) => void = () => {};
  export let onMovePhotoDown: (index: number) => void = () => {};
  export let onAddPhotoClick: () => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};
  export let onOpenWikiLink: (dest: string, sourcePath: string) => void = () => {};

  function inputValue(ev: Event): string {
    return (ev.currentTarget as HTMLInputElement).value;
  }

  function textareaValue(ev: Event): string {
    return (ev.currentTarget as HTMLTextAreaElement).value;
  }

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-wandernForm udn-feedDetailForm">
  <div class="udn-feedDetailFeedBlock">
    <span class="udn-composerSummaryLabel">Tagebuch-Feed</span>
    <div class="udn-composerAddRow udn-feedDetailFeedRow">
      <input
        type="text"
        class="{dk.input} udn-timeBubble udn-timeBubbleInput"
        value={feedTime}
        on:input={(ev) => onFeedTimeChange(inputValue(ev))}
        on:focus={focusTarget}
        placeholder="HH:mm"
        aria-label="Zeit"
      />
      <input
        type="text"
        class="{dk.input} udn-composerSummaryInput udn-feedDetailFeedInput"
        value={feedText}
        on:input={(ev) => onFeedTextChange(inputValue(ev))}
        on:focus={focusTarget}
        placeholder="Kurztext für ## Tagebuch…"
      />
    </div>
  </div>

  <div class="udn-feedDetailVerweise">
    <span class="udn-composerSummaryLabel">Verweise</span>
    <JournalBodyInput
      {app}
      {sourcePath}
      {feedProfile}
      linkBubbles
      value={feedLinks}
      className="udn-composerSummaryInput udn-feedDetailVerweiseInput"
      placeholder="[[Seite]] oder [[Seite|Alias]] — [[ für Vorschläge"
      ariaLabel="Verweise für Tagebuch-Feed"
      onInput={onFeedLinksChange}
      onFocus={focusTarget}
      onOpenWikiLink={onOpenWikiLink}
    />
  </div>

  <label class="udn-composerSummary">
    <span class="udn-composerSummaryLabel">Detail</span>
    <textarea
      class="{dk.input} udn-wandernTextarea"
      rows="5"
      value={detail}
      on:input={(ev) => onDetailChange(textareaValue(ev))}
      on:focus={focusTarget}
      placeholder="Ausführliche Dokumentation mit Fotos im Abschnitt ## {profileLabel}…"
    ></textarea>
  </label>

  <PhotoCollageField
    {app}
    {photos}
    {maxPhotos}
    onAddPhotoClick={onAddPhotoClick}
    onRemovePhoto={onRemovePhoto}
    onMovePhotoUp={onMovePhotoUp}
    onMovePhotoDown={onMovePhotoDown}
  />
</div>
