<script lang="ts">
  import type { App } from "obsidian";
  import { tick } from "svelte";
  import { dk, sidebarPointerAction } from "@denkarium/obsidian-lib-ui";
  import { panelTapAction } from "../panelTapAction";
  import { parseJournalEntryDisplay } from "../../notes/parseJournalEntryDisplay";
  import { stripCalendarSyncMarker } from "../../integrations/calendarSyncMarker";
  import { parseWikiLinks } from "../../notes/parseWikiLinks";
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

  $: display = parseJournalEntryDisplay(entry.text);
  $: displayBody = stripCalendarSyncMarker(display.body);
  $: storedTime = display.time ?? "";

  let timeDraft = "";
  let timeEditing = false;

  $: if (!timeEditing && !editing) {
    timeDraft = storedTime;
  }

  function onTimeFocus() {
    if (editing) return;
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
    if (target.closest("a.internal-link, input, button")) return;
    onSelectDay(day);
  }
</script>

<div
  class="udn-outlineEntry"
  class:udn-outlineEntry--editing={editing}
  use:panelTapAction={onEntryTap}
>
  {#if showTimeBubbles}
    {#if editing}
      <input
        type="text"
        class="{dk.input} udn-timeBubble udn-timeBubbleInput"
        bind:value={editTime}
        placeholder="HH:mm"
        inputmode="numeric"
        aria-label="Zeit"
        on:keydown={onTimeKeydown}
      />
    {:else}
      <input
        type="text"
        class="{dk.input} udn-timeBubble udn-timeBubbleInput"
        bind:value={timeDraft}
        placeholder="HH:mm"
        inputmode="numeric"
        aria-label="Zeit"
        on:focus={onTimeFocus}
        on:blur={onTimeBlur}
        on:keydown={onTimeKeydown}
      />
    {/if}
  {/if}
  {#if editing}
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
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <span
      class="udn-timelineEntryBody"
      title="Doppelklick zum Bearbeiten"
      on:dblclick={() => onStartEdit(day, entry)}
    >
      {#each parseWikiLinks(displayBody) as seg, i (i + seg.kind + (seg.kind === "link" ? seg.dest : seg.value))}
        {#if seg.kind === "link"}
          <a
            href="#"
            class="internal-link"
            use:sidebarPointerAction={() => onOpenWikiLink(seg.dest, day.filePath)}
          >{seg.label}</a>
        {:else}{seg.value}{/if}
      {/each}
    </span>
  {/if}
</div>
