<script lang="ts">
  import { onMount, afterUpdate } from "svelte";
  import type { App } from "obsidian";
  import { setIcon } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { DailyNoteFallbackSettings } from "../../settings";
  import { addLocalDays, formatTimeLocal, normalizeLocalDay } from "../dateUtils";
  import { formatDayBubbleLabel } from "../formatDayBubble";
  import {
    buildChipEntryText,
    chipsFromPrefixes,
    loadComposerState,
    saveComposerState,
    suggestSummaryFromEntries,
    type ComposerChip,
    type ComposerEntry,
  } from "../../notes/dailyComposer";
  import { openOrCreateDailyNoteForDate } from "../../notes/dailyNote";
  import { parseJournalEntryDisplay } from "../../notes/parseJournalEntryDisplay";

  export let app: App;
  export let date: Date;
  export let fallback: DailyNoteFallbackSettings;
  export let journalHeading: string;
  export let entryPrefixes: string[] = [];
  export let timeFormat = "HH:mm";
  export let onClose: () => void = () => {};
  export let onSaved: () => void = () => {};
  export let onDateChange: (d: Date) => void = () => {};

  let currentDate = normalizeLocalDay(date);
  let loading = true;
  let saving = false;
  let loadError = "";
  let filePath = "";
  let summary = "";
  let summaryTouched = false;
  let entries: ComposerEntry[] = [];
  let chips: ComposerChip[] = [];
  let newEntryText = "";
  let modified = false;
  let prevBtn: HTMLButtonElement;
  let nextBtn: HTMLButtonElement;
  let nowBtn: HTMLButtonElement;
  let loadGeneration = 0;

  $: chips = chipsFromPrefixes(entryPrefixes);
  $: dateLabel = formatDayBubbleLabel(
    `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`,
  );
  $: weekdayLabel = currentDate.toLocaleDateString("de-DE", { weekday: "long" });

  onMount(() => {
    void reload();
    updateNavButtons();
  });

  async function reload() {
    const generation = ++loadGeneration;
    loading = true;
    loadError = "";
    modified = false;
    onDateChange(currentDate);
    try {
      const state = await loadComposerState(app, currentDate, fallback, journalHeading);
      if (generation !== loadGeneration) return;
      filePath = state.file.path;
      entries = state.entries.map((e) => ({ ...e }));
      summary = state.summary;
      summaryTouched = Boolean(state.summary.trim());
      newEntryText = "";
    } catch (e) {
      if (generation !== loadGeneration) return;
      loadError = "Tagesnotiz konnte nicht geladen werden.";
      console.error("Universal Daily Note: Composer load", e);
    } finally {
      if (generation === loadGeneration) loading = false;
    }
  }

  function currentTime(): string {
    return formatTimeLocal(new Date(), timeFormat);
  }

  function markModified() {
    modified = true;
  }

  function addChipEntry(chip: ComposerChip) {
    const time = chip.defaultTime ?? currentTime();
    const text = buildChipEntryText(chip, time);
    entries = [...entries, makeNewEntry(text)];
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map((e) => e.text));
    }
  }

  function makeNewEntry(text: string): ComposerEntry {
    const id = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return { id, line: -1, text: text.trim(), rawLine: `- ${text.trim()}` };
  }

  function addFreeEntry() {
    const text = newEntryText.trim();
    if (!text) return;
    const withTime = /^\d{1,2}:\d{2}\s/.test(text) ? text : `${currentTime()} ${text}`;
    entries = [...entries, makeNewEntry(withTime)];
    newEntryText = "";
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map((e) => e.text));
    }
  }

  function updateEntry(id: string, text: string) {
    entries = entries.map((e) => (e.id === id ? { ...e, text: text.trim() } : e));
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map((e) => e.text));
    }
  }

  function removeEntry(id: string) {
    entries = entries.filter((e) => e.id !== id);
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map((e) => e.text));
    }
  }

  function onSummaryInput(ev: Event) {
    summaryTouched = true;
    summary = (ev.currentTarget as HTMLInputElement).value;
    markModified();
  }

  async function shiftDate(delta: number) {
    if (modified && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
    currentDate = addLocalDays(currentDate, delta);
    onDateChange(currentDate);
    await reload();
  }

  async function goToday() {
    if (modified && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
    currentDate = normalizeLocalDay(new Date());
    onDateChange(currentDate);
    await reload();
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      const state = await loadComposerState(app, currentDate, fallback, journalHeading);
      await saveComposerState(
        app,
        { file: state.file, journalHeading, summary },
        entries.map((e) => e.text),
      );
      onSaved();
      summaryTouched = Boolean(summary.trim());
      await reload();
    } catch (e) {
      console.error("Universal Daily Note: Composer save", e);
      loadError = "Speichern fehlgeschlagen.";
    } finally {
      saving = false;
    }
  }

  async function openInEditor() {
    await openOrCreateDailyNoteForDate(app, currentDate, fallback);
  }

  function onEntryInput(id: string, ev: Event) {
    updateEntry(id, (ev.currentTarget as HTMLInputElement).value);
  }

  function entryTime(text: string): string | null {
    return parseJournalEntryDisplay(text).time;
  }

  function onNewEntryKeydown(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      addFreeEntry();
    }
  }

  function updateNavButtons() {
    if (prevBtn) {
      setIcon(prevBtn, "chevron-left");
      prevBtn.title = "Vorheriger Tag";
    }
    if (nextBtn) {
      setIcon(nextBtn, "chevron-right");
      nextBtn.title = "Nächster Tag";
    }
    if (nowBtn) {
      setIcon(nowBtn, "calendar-check");
      nowBtn.title = "Heute";
    }
  }

  afterUpdate(() => {
    updateNavButtons();
  });
</script>

<div class="udn-composer">
  <header class="udn-composerHead">
    <div class="udn-composerHeadNav">
      <button type="button" bind:this={prevBtn} class={dk.iconRoundBtn} on:click={() => shiftDate(-1)} aria-label="Vorheriger Tag"></button>
      <div class="udn-composerHeadDate">
        <strong>{weekdayLabel}, {dateLabel}</strong>
        <span class="udn-composerHeadSub">{journalHeading}</span>
      </div>
      <button type="button" bind:this={nextBtn} class={dk.iconRoundBtn} on:click={() => shiftDate(1)} aria-label="Nächster Tag"></button>
      <button type="button" bind:this={nowBtn} class={dk.iconRoundBtn} on:click={goToday} aria-label="Heute"></button>
    </div>
    <label class="udn-composerSummary">
      <span class="udn-composerSummaryLabel">Zusammenfassung</span>
      <input
        type="text"
        class="{dk.input} udn-composerSummaryInput"
        value={summary}
        on:input={onSummaryInput}
        placeholder="Kurzüberblick für Frontmatter…"
      />
    </label>
  </header>

  {#if loading}
    <p class={dk.empty}>Lade Tagesnotiz…</p>
  {:else if loadError}
    <p class="{dk.empty} udn-composerError">{loadError}</p>
  {:else}
    <section class="udn-composerSection">
      <div class="udn-composerSectionHead">
        <h3 class="udn-composerSectionTitle">Chronik</h3>
        <span class="udn-composerSectionMeta">{entries.length} Einträge</span>
      </div>

      <div class="udn-composerChips">
        {#each chips as chip (chip.template)}
          <button type="button" class="udn-composerChip" on:click={() => addChipEntry(chip)}>
            {chip.label}
          </button>
        {/each}
      </div>

      <ul class="udn-composerEntries">
        {#each entries as entry (entry.id)}
          <li class="udn-composerEntry">
            {#if entryTime(entry.text)}
              <span class="udn-composerEntryTime">{entryTime(entry.text)}</span>
            {/if}
            <input
              type="text"
              class="{dk.input} udn-composerEntryInput"
              value={entry.text}
              on:input={(ev) => onEntryInput(entry.id, ev)}
            />
            <button
              type="button"
              class="udn-composerEntryRemove"
              aria-label="Eintrag entfernen"
              on:click={() => removeEntry(entry.id)}
            >×</button>
          </li>
        {/each}
        {#if entries.length === 0}
          <li class="udn-composerEntry udn-composerEntry--empty">Noch keine Einträge — Chip wählen oder unten eingeben.</li>
        {/if}
      </ul>

      <div class="udn-composerAddRow">
        <input
          type="text"
          class="{dk.input} udn-composerAddInput"
          placeholder="Neuer Eintrag (Enter) — Zeit wird ergänzt wenn fehlend"
          bind:value={newEntryText}
          on:keydown={onNewEntryKeydown}
        />
        <button type="button" class={dk.btn} on:click={addFreeEntry} disabled={!newEntryText.trim()}>+</button>
      </div>
    </section>
  {/if}

  <footer class="udn-composerFoot">
    <button type="button" class={dk.btn} on:click={onClose}>Schließen</button>
    <button type="button" class={dk.btn} on:click={openInEditor} disabled={loading}>In Notiz öffnen</button>
    <button type="button" class={dk.btnPrimary} on:click={save} disabled={loading || saving}>
      {saving ? "Speichern…" : "Speichern"}
    </button>
  </footer>
</div>
