<script lang="ts">
  import type { App } from "obsidian";
  import { tick } from "svelte";
  import { dk, sidebarPointerAction } from "@denkarium/obsidian-lib-ui";
  import { panelTapAction } from "../panelTapAction";
  import { parseJournalEntryDisplay } from "../../notes/parseJournalEntryDisplay";
  import { stripCalendarSyncMarker } from "../../integrations/calendarSyncMarker";
  import { stripJournalLineForDisplay } from "../../notes/journalEntryMeta";
  import { bodyHasWikiLinks } from "../../notes/feedEntryDisplay";
  import { effectiveFeedProfile } from "../../notes/feedMetadata";
  import { feedProfileLabel } from "../../notes/feedMetadata";
  import FeedLinkBubbleBody from "../FeedLinkBubbleBody.svelte";
  import ProfileBubble from "../ProfileBubble.svelte";
  import { wikiLinkSuggest, isWikiLinkSuggestOpen } from "../wikiLinkInputSuggest";
  import type { TimelineDay, TimelineEntry } from "../../notes/dailyNoteTimeline";

  export let day: TimelineDay;
  export let entry: TimelineEntry;
  export let app: App;
  export let showTimeBubbles = true;
  export let editing = false;
  export let editTime = "";
  export let editBody = "";
  export let editInput: HTMLInputElement | undefined = undefined;
  export let onStartEdit: (day: TimelineDay, entry: TimelineEntry) => void = () => {};
  export let onCommitEdit: (day: TimelineDay, entry: TimelineEntry) => void = () => {};
  export let onCommitTimeEdit: (day: TimelineDay, entry: TimelineEntry, time: string) => void = () => {};
  export let onEditKeydown: (day: TimelineDay, entry: TimelineEntry, ev: KeyboardEvent) => void = () => {};
  export let onOpenWikiLink: (dest: string, sourcePath: string) => void = () => {};
  export let onSelectDay: (day: TimelineDay) => void = () => {};
  export let onOpenComposerEntry: (day: TimelineDay, entry: TimelineEntry) => void = () => {};
  /** Verweise-Panel: gleiche Darstellung, ohne Inline-Bearbeitung. */
  export let readOnly = false;

  $: display = parseJournalEntryDisplay(stripJournalLineForDisplay(entry.text));
  $: entryTitle = readOnly ? "Zur Tagesnotiz springen" : "Im Composer bearbeiten";
  $: displayBody = stripCalendarSyncMarker(display.body);
  $: storedTime = display.time ?? "";
  $: hasWikiLinks = bodyHasWikiLinks(displayBody);
  $: effectiveProfile = effectiveFeedProfile(entry.feedProfile, entry.feedContext);
  $: showProfileBubble = effectiveProfile !== "tagebuch";

  let timeDraft = "";
  let timeEditing = false;

  $: if (!timeEditing && !editing) {
    timeDraft = storedTime;
  }

  function onTimeFocus() {
    if (readOnly || editing) return;
    timeEditing = true;
    timeDraft = storedTime;
  }

  function onTimeBlur(ev: FocusEvent) {
    timeEditing = false;
    if (editing) return;
    onCommitTimeEdit(day, entry, (ev.currentTarget as HTMLInputElement).value);
  }

  function onTimeKeydown(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      (ev.currentTarget as HTMLInputElement).blur();
    }
  }

  function applyWikiLinkValue(next: string, cursor: number) {
    editBody = next;
    void tick().then(() => {
      editInput?.focus();
      editInput?.setSelectionRange(cursor, cursor);
    });
  }

  function onEditBlur() {
    window.setTimeout(() => {
      if (isWikiLinkSuggestOpen()) return;
      onCommitEdit(day, entry);
    }, 150);
  }

  function onEntryTap(ev: PointerEvent) {
    const target = ev.target as HTMLElement;
    if (target.closest("a.internal-link, input, button, .udn-profileBubble")) return;
    onOpenComposerEntry(day, entry);
  }
</script>

<div
  class="udn-outlineEntry"
  class:udn-outlineEntry--editing={!readOnly && editing}
  class:udn-outlineEntry--hasLinks={hasWikiLinks}
  title={entryTitle}
  use:panelTapAction={onEntryTap}
>
  <div class="udn-outlineEntryMain">
    {#if showTimeBubbles}
      {#if readOnly}
        {#if display.time}
          <span class="udn-timeBubble">{display.time}</span>
        {/if}
      {:else if editing}
        <input
          type="text"
          class="{dk.input} udn-timeBubble udn-timeBubbleInput"
          bind:value={editTime}
          placeholder="HH:mm"
          aria-label="Zeit"
          on:keydown={onTimeKeydown}
        />
      {:else}
        <input
          type="text"
          class="{dk.input} udn-timeBubble udn-timeBubbleInput"
          bind:value={timeDraft}
          placeholder="HH:mm"
          aria-label="Zeit"
          on:focus={onTimeFocus}
          on:blur={onTimeBlur}
          on:keydown={onTimeKeydown}
        />
      {/if}
    {/if}
    {#if showProfileBubble}
      <ProfileBubble
        profile={effectiveProfile}
        title={readOnly
          ? `${feedProfileLabel(effectiveProfile)} — zur Tagesnotiz`
          : `${feedProfileLabel(effectiveProfile)} — im Composer bearbeiten`}
        onClick={(ev) => {
          ev.stopPropagation();
          onOpenComposerEntry(day, entry);
        }}
      />
    {/if}
    {#if !readOnly && editing}
      <input
        type="text"
        class="{dk.input} udn-timelineEntryEdit"
        bind:value={editBody}
        bind:this={editInput}
        use:wikiLinkSuggest={{ app, sourcePath: day.filePath, onValueChange: applyWikiLinkValue }}
        on:blur={onEditBlur}
        on:keydown={(ev) => onEditKeydown(day, entry, ev)}
      />
    {:else}
      <FeedLinkBubbleBody
        {app}
        text={displayBody}
        feedProfile={entry.feedProfile}
        feedContext={entry.feedContext ?? ""}
        sourcePath={day.filePath}
        title={entryTitle}
        onOpenWikiLink={onOpenWikiLink}
        onDblclick={readOnly ? undefined : () => onOpenComposerEntry(day, entry)}
      />
    {/if}
  </div>
</div>
