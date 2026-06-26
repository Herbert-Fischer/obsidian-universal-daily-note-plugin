<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from "svelte";
  import type { App } from "obsidian";
  import { Menu, setIcon } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { DailyNoteFallbackSettings, TagebuchVerweiseSettings, CalendarSyncSettings } from "../../settings";
  import { DEFAULT_SETTINGS } from "../../settings";
  import { addLocalDays, formatTimeLocal, normalizeLocalDay } from "../dateUtils";
  import { formatDayBubbleLabel } from "../formatDayBubble";
  import {
    buildChipEntryText,
    chipsFromPrefixes,
    composerEntryText,
    loadComposerSectionHeadings,
    loadComposerState,
    saveComposerState,
    suggestSummaryFromEntries,
    type ComposerChip,
    type ComposerEntry,
  } from "../../notes/dailyComposer";
  import { openOrCreateDailyNoteForDate } from "../../notes/dailyNote";
  import { formatJournalEntryText, parseJournalEntryDisplay } from "../../notes/parseJournalEntryDisplay";
  import { openWikiLinkInMain } from "../../notes/openInMainPane";
  import JournalBodyInput from "./JournalBodyInput.svelte";
  import { wikiLinkSuggest } from "../wikiLinkInputSuggest";
  import { WEATHER_VORLAGE_LABEL } from "../../weather/insertWeather";
  import { WEATHER_ICON } from "../../weather/weatherUi";
  import { isWikiLinkSuggestOpen } from "../wikiLinkInputSuggest";
  import {
    observeDockHeight,
    scrollInputIntoView,
  } from "./mobileViewport";

  export let app: App;
  export let date: Date;
  export let fallback: DailyNoteFallbackSettings;
  export let initialJournalHeading: string;
  export let excludedHeadings: string[] = [];
  export let durationDays = 365;
  export let tagebuchSettings: TagebuchVerweiseSettings;
  export let entryPrefixes: string[] = [];
  export let calendarSync: CalendarSyncSettings = DEFAULT_SETTINGS.calendarSync;
  export let timeFormat = "HH:mm";
  export let onClose: () => void = () => {};
  export let onSaved: () => void = () => {};
  export let onDateChange: (d: Date) => void = () => {};
  export let onHeadingChange: (heading: string) => void = () => {};
  export let isMobile = false;
  export let onInsertWeather: () => Promise<boolean> = async () => false;

  let currentDate = normalizeLocalDay(date);
  let activeHeading = initialJournalHeading.trim() || "Tagebuch";
  let sectionHeadings: string[] = [activeHeading];
  let loading = true;
  let saving = false;
  let loadError = "";
  let filePath = "";
  let summary = "";
  let calloutTitle = "";
  let summaryTouched = false;
  let entries: ComposerEntry[] = [];
  let chips: ComposerChip[] = [];
  let newEntryText = "";
  let newEntryTime = "";
  let modified = false;
  let prevBtn: HTMLButtonElement;
  let nextBtn: HTMLButtonElement;
  let nowBtn: HTMLButtonElement;
  let closeBtn: HTMLButtonElement;
  let headingBtn: HTMLButtonElement;
  let headingIconEl: HTMLSpanElement;
  let prefixBtn: HTMLButtonElement;
  let prefixIconEl: HTMLSpanElement;
  let composerRoot: HTMLDivElement;
  let mobileDock: HTMLDivElement;
  let addInput: HTMLInputElement;
  let detachDockObserver: (() => void) | null = null;
  let dockObserverAttached = false;
  let loadGeneration = 0;
  let weatherBusy = false;

  $: chips = chipsFromPrefixes(entryPrefixes);
  $: prefixMenuEnabled = chips.length > 0 || !!onInsertWeather;
  $: dateLabel = formatDayBubbleLabel(
    `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`,
  );
  $: weekdayShort = currentDate.toLocaleDateString("de-DE", { weekday: "short" });

  onMount(() => {
    void reload();
    updateNavButtons();
  });

  onDestroy(() => {
    detachDockObserver?.();
  });

  async function reload() {
    const generation = ++loadGeneration;
    loading = true;
    loadError = "";
    modified = false;
    onDateChange(currentDate);
    try {
      if (calendarSync?.enabled && activeHeading.trim().toLowerCase() === "tagebuch") {
        try {
          const { syncCalendarAppointmentsIntoDailyNote } = await import("../../integrations/calendarAppointments");
          await syncCalendarAppointmentsIntoDailyNote(app, {
            date: currentDate,
            fallback,
            journalHeading: activeHeading,
            settings: calendarSync,
          });
        } catch (syncErr) {
          console.warn("Universal Daily Note: Kalender-Sync beim Composer-Laden", syncErr);
        }
      }
      const [state, headings] = await Promise.all([
        loadComposerState(app, currentDate, fallback, activeHeading),
        loadComposerSectionHeadings(app, currentDate, fallback, tagebuchSettings, {
          excludedHeadings,
          defaultHeading: activeHeading,
          durationDays,
        }),
      ]);
      if (generation !== loadGeneration) return;
      sectionHeadings = headings.length > 0 ? headings : [activeHeading];
      if (!sectionHeadings.some((h) => h.toLowerCase() === activeHeading.toLowerCase())) {
        sectionHeadings = [activeHeading, ...sectionHeadings];
      }
      filePath = state.file.path;
      entries = state.entries.map((e) => ({ ...e }));
      calloutTitle = state.calloutTitle;
      summary = state.summary;
      summaryTouched = Boolean(state.summary.trim());
      newEntryText = "";
      newEntryTime = currentTime();
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
    const { time: entryTime, body } = parseJournalEntryDisplay(buildChipEntryText(chip, time));
    entries = [...entries, makeNewEntry(entryTime ?? time, body)];
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map(composerEntryText));
    }
  }

  function makeNewEntry(time: string, body: string): ComposerEntry {
    const id = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const text = composerEntryText({ time, body }).trim();
    return { id, line: -1, time, body, rawLine: `- ${text}` };
  }

  function addFreeEntry() {
    const body = newEntryText.trim();
    if (!body) return;
    const time = newEntryTime.trim() || currentTime();
    entries = [...entries, makeNewEntry(time, body)];
    newEntryText = "";
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map(composerEntryText));
    }
    if (isMobile && addInput) {
      addInput.focus();
    }
  }

  function updateEntry(id: string, patch: Partial<Pick<ComposerEntry, "time" | "body">>) {
    entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map(composerEntryText));
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

  function onCalloutTitleInput(ev: Event) {
    calloutTitle = (ev.currentTarget as HTMLInputElement).value;
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

  async function selectHeading(heading: string) {
    if (heading.toLowerCase() === activeHeading.toLowerCase()) return;
    if (modified && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
    activeHeading = heading;
    onHeadingChange(heading);
    await reload();
  }

  function openHeadingMenu(ev: MouseEvent) {
    if (sectionHeadings.length <= 1) return;
    const menu = new Menu();
    for (const heading of sectionHeadings) {
      menu.addItem((item) => {
        item.setTitle(heading);
        item.setChecked(heading.toLowerCase() === activeHeading.toLowerCase());
        item.onClick(() => {
          void selectHeading(heading);
        });
      });
    }
    const target = ev.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  }

  function onHeadingFilterClick(ev: MouseEvent) {
    openHeadingMenu(ev);
  }

  function openPrefixMenu(ev: MouseEvent) {
    if (!prefixMenuEnabled) return;
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle(WEATHER_VORLAGE_LABEL);
      item.setIcon(WEATHER_ICON);
      item.onClick(() => void runWeatherVorlage());
    });
    for (const chip of chips) {
      menu.addItem((item) => {
        item.setTitle(chip.label);
        item.onClick(() => addChipEntry(chip));
      });
    }
    const target = ev.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  }

  function onPrefixFilterClick(ev: MouseEvent) {
    openPrefixMenu(ev);
  }

  async function runWeatherVorlage() {
    if (weatherBusy) return;
    weatherBusy = true;
    try {
      const ok = await onInsertWeather();
      if (ok) {
        const state = await loadComposerState(app, currentDate, fallback, activeHeading);
        calloutTitle = state.calloutTitle;
        summary = state.summary;
      }
    } finally {
      weatherBusy = false;
    }
  }

  function collectEntryTextsForSave(): string[] {
    const texts = entries.map(composerEntryText);
    const pending = newEntryText.trim();
    if (pending) {
      texts.push(formatJournalEntryText(newEntryTime.trim() || currentTime(), pending));
    }
    return texts;
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      const state = await loadComposerState(app, currentDate, fallback, activeHeading);
      let entryTexts = collectEntryTextsForSave();
      if (calendarSync?.enabled && activeHeading.trim().toLowerCase() === "tagebuch") {
        const { mergeCalendarAppointmentTexts } = await import("../../integrations/calendarAppointments");
        entryTexts = mergeCalendarAppointmentTexts(app, currentDate, entryTexts, {
          settings: calendarSync,
        });
      }
      await saveComposerState(
        app,
        {
          file: state.file,
          journalHeading: activeHeading,
          calloutTitle,
          summary,
          dateKey: state.dateKey,
        },
        entryTexts,
      );
      onSaved();
      onClose();
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

  function onEntryTimeInput(id: string, ev: Event) {
    updateEntry(id, { time: (ev.currentTarget as HTMLInputElement).value });
  }

  function openComposerWikiLink(dest: string) {
    void openWikiLinkInMain(app, dest, filePath);
  }

  function onEntryBodyInput(id: string, body: string) {
    updateEntry(id, { body });
  }

  function applyNewEntryWikiLink(next: string, cursor: number) {
    newEntryText = next;
    void tick().then(() => {
      addInput?.focus();
      addInput?.setSelectionRange(cursor, cursor);
    });
  }

  function onNewEntryKeydown(ev: KeyboardEvent) {
    if (ev.key !== "Enter" || ev.isComposing || ev.shiftKey) return;
    if (isWikiLinkSuggestOpen()) return;
    ev.preventDefault();
    ev.stopPropagation();
    addFreeEntry();
  }

  function onInputFocus(ev: FocusEvent) {
    if (!isMobile) return;
    scrollInputIntoView(ev.currentTarget as HTMLElement);
  }

  function onAddInputFocus(ev: FocusEvent) {
    if (!isMobile) return;
    scrollInputIntoView(ev.currentTarget as HTMLElement);
  }

  function ensureIcon(el: HTMLElement | undefined, icon: string) {
    if (!el) return;
    if (el.dataset.udnIcon === icon) return;
    setIcon(el, icon);
    el.dataset.udnIcon = icon;
  }

  function updateNavButtons() {
    if (prevBtn) {
      ensureIcon(prevBtn, "chevron-left");
      prevBtn.title = "Vorheriger Tag";
    }
    if (nextBtn) {
      ensureIcon(nextBtn, "chevron-right");
      nextBtn.title = "Nächster Tag";
    }
    if (nowBtn) {
      ensureIcon(nowBtn, "calendar-check");
      nowBtn.title = "Heute";
    }
    if (closeBtn) {
      ensureIcon(closeBtn, "x");
      closeBtn.title = "Schließen";
    }
    if (headingIconEl) {
      ensureIcon(headingIconEl, "heading");
    }
    if (headingBtn) {
      headingBtn.setAttribute("aria-label", `Abschnitt: ${activeHeading}`);
      headingBtn.title = activeHeading;
    }
    if (prefixIconEl) {
      ensureIcon(prefixIconEl, "list-plus");
    }
    if (prefixBtn) {
      prefixBtn.setAttribute("aria-label", "Vorlage wählen");
      prefixBtn.title = "Vorlage wählen";
    }
  }

  afterUpdate(() => {
    updateNavButtons();
    if (isMobile && mobileDock && composerRoot && !dockObserverAttached) {
      detachDockObserver = observeDockHeight(mobileDock, composerRoot);
      dockObserverAttached = true;
    }
  });
</script>

<div class="udn-composer" class:udn-composer--mobile={isMobile} bind:this={composerRoot}>
  <header class="udn-composerHead">
    {#if isMobile}
      <div class="udn-composerHeadCompact">
        <div class="udn-composerHeadCompactTop">
          <button type="button" bind:this={closeBtn} class={dk.iconRoundBtn} on:click={onClose} aria-label="Schließen"></button>
          <span class="udn-composerDateShort">{weekdayShort} · {dateLabel}</span>
          <div class="udn-composerHeadCompactNav">
            <button type="button" bind:this={prevBtn} class={dk.iconRoundBtn} on:click={() => shiftDate(-1)} aria-label="Vorheriger Tag"></button>
            <button type="button" bind:this={nextBtn} class={dk.iconRoundBtn} on:click={() => shiftDate(1)} aria-label="Nächster Tag"></button>
            <button type="button" bind:this={nowBtn} class={dk.iconRoundBtn} on:click={goToday} aria-label="Heute"></button>
          </div>
        </div>
        <div class="udn-composerFilterBubbles">
          <button
            type="button"
            bind:this={headingBtn}
            class="udn-headingFilter udn-composerHeadingFilter"
            class:udn-headingFilter--menu={sectionHeadings.length > 1}
            disabled={sectionHeadings.length <= 1}
            on:click={onHeadingFilterClick}
          >
            <span class="udn-headingFilterIcon" bind:this={headingIconEl} aria-hidden="true"></span>
            <span class="udn-headingFilterLabel">{activeHeading}</span>
          </button>
          <button
            type="button"
            bind:this={prefixBtn}
            class="udn-headingFilter udn-composerPrefixFilter udn-headingFilter--menu"
            disabled={!prefixMenuEnabled}
            on:click={onPrefixFilterClick}
          >
            <span class="udn-headingFilterIcon" bind:this={prefixIconEl} aria-hidden="true"></span>
            <span class="udn-headingFilterLabel">Vorlage</span>
          </button>
        </div>
      </div>
    {:else}
      <div class="udn-composerHeadNav">
        <button type="button" bind:this={prevBtn} class={dk.iconRoundBtn} on:click={() => shiftDate(-1)} aria-label="Vorheriger Tag"></button>
        <div class="udn-composerHeadDate">
          <strong>{currentDate.toLocaleDateString("de-DE", { weekday: "long" })}, {dateLabel}</strong>
        </div>
        <button type="button" bind:this={nextBtn} class={dk.iconRoundBtn} on:click={() => shiftDate(1)} aria-label="Nächster Tag"></button>
        <button type="button" bind:this={nowBtn} class={dk.iconRoundBtn} on:click={goToday} aria-label="Heute"></button>
      </div>
      <div class="udn-composerFilterBubbles">
        <button
          type="button"
          bind:this={headingBtn}
          class="udn-headingFilter udn-composerHeadingFilter"
          class:udn-headingFilter--menu={sectionHeadings.length > 1}
          disabled={sectionHeadings.length <= 1}
          on:click={onHeadingFilterClick}
        >
          <span class="udn-headingFilterIcon" bind:this={headingIconEl} aria-hidden="true"></span>
          <span class="udn-headingFilterLabel">{activeHeading}</span>
        </button>
        <button
          type="button"
          bind:this={prefixBtn}
          class="udn-headingFilter udn-composerPrefixFilter udn-headingFilter--menu"
          disabled={!prefixMenuEnabled}
          on:click={onPrefixFilterClick}
        >
          <span class="udn-headingFilterIcon" bind:this={prefixIconEl} aria-hidden="true"></span>
          <span class="udn-headingFilterLabel">Vorlage</span>
        </button>
      </div>
    {/if}

    {#if !isMobile}
      <label class="udn-composerSummary">
        <span class="udn-composerSummaryLabel">Zusammenfassung</span>
        <input
          type="text"
          class="{dk.input} udn-composerSummaryInput"
          value={summary}
          on:input={onSummaryInput}
          on:focus={onInputFocus}
          placeholder="Kurzüberblick für Frontmatter…"
        />
      </label>
      <label class="udn-composerSummary">
        <span class="udn-composerSummaryLabel">Callout-Titel</span>
        <input
          type="text"
          class="{dk.input} udn-composerSummaryInput"
          value={calloutTitle}
          on:input={onCalloutTitleInput}
          on:focus={onInputFocus}
          placeholder="Titel in der Callout-Zeile…"
        />
      </label>
    {/if}
  </header>

  {#if loading}
    <p class={dk.empty}>Lade…</p>
  {:else if loadError}
    <p class="{dk.empty} udn-composerError">{loadError}</p>
  {:else}
    <section class="udn-composerSection">
      {#if isMobile}
        <label class="udn-composerCalloutTitle">
          <span class="udn-composerSummaryLabel">Zusammenfassung</span>
          <input
            type="text"
            class="{dk.input} udn-composerSummaryInput"
            value={summary}
            on:input={onSummaryInput}
            on:focus={onInputFocus}
            placeholder="Kurzüberblick für Frontmatter…"
          />
        </label>
        <label class="udn-composerCalloutTitle">
          <span class="udn-composerSummaryLabel">Callout-Titel</span>
          <input
            type="text"
            class="{dk.input} udn-composerSummaryInput"
            value={calloutTitle}
            on:input={onCalloutTitleInput}
            on:focus={onInputFocus}
            placeholder="Titel in der Callout-Zeile…"
          />
        </label>
      {/if}

      <ul class="udn-composerEntries">
        {#each entries as entry (entry.id)}
          <li class="udn-outlineEntry udn-composerEntry">
            <input
              type="text"
              class="{dk.input} udn-timeBubble udn-timeBubbleInput"
              value={entry.time}
              placeholder="HH:mm"
              inputmode="numeric"
              aria-label="Zeit"
              on:input={(ev) => onEntryTimeInput(entry.id, ev)}
              on:focus={onInputFocus}
            />
            <JournalBodyInput
              {app}
              value={entry.body}
              className="udn-timelineEntryEdit udn-composerEntryInput"
              sourcePath={filePath}
              onInput={(body) => onEntryBodyInput(entry.id, body)}
              onFocus={onInputFocus}
              onOpenWikiLink={openComposerWikiLink}
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
          <li class="udn-composerEntry udn-composerEntry--empty">
            {isMobile ? "Keine Einträge — Vorlage oder Eingabe unten." : "Noch keine Einträge — Vorlage wählen oder unten eingeben."}
          </li>
        {/if}
      </ul>

      {#if !isMobile}
        <div class="udn-composerAddRow">
          <input
            type="text"
            class="{dk.input} udn-timeBubble udn-timeBubbleInput"
            bind:value={newEntryTime}
            placeholder="HH:mm"
            inputmode="numeric"
            aria-label="Zeit für neuen Eintrag"
            on:focus={onInputFocus}
          />
          <input
            type="text"
            class="{dk.input} udn-composerAddInput"
            placeholder="Neuer Eintrag (Enter)"
            bind:value={newEntryText}
            use:wikiLinkSuggest={{ app, sourcePath: filePath, onValueChange: applyNewEntryWikiLink }}
            on:keydown={onNewEntryKeydown}
            on:focus={onInputFocus}
          />
          <button type="button" class={dk.btn} on:click={addFreeEntry} disabled={!newEntryText.trim()}>+</button>
        </div>
      {/if}
    </section>
  {/if}

  {#if !loading && !loadError && isMobile}
    <div class="udn-composerMobileDock" bind:this={mobileDock}>
      <div class="udn-composerAddRow udn-composerAddRow--pinned">
        <input
          type="text"
          class="{dk.input} udn-timeBubble udn-timeBubbleInput"
          bind:value={newEntryTime}
          placeholder="HH:mm"
          inputmode="numeric"
          aria-label="Zeit für neuen Eintrag"
          on:focus={onAddInputFocus}
        />
        <input
          type="text"
          bind:this={addInput}
          class="{dk.input} udn-composerAddInput"
          placeholder="Neuer Eintrag"
          enterkeyhint="done"
          bind:value={newEntryText}
          use:wikiLinkSuggest={{ app, sourcePath: filePath, onValueChange: applyNewEntryWikiLink }}
          on:keydown={onNewEntryKeydown}
          on:focus={onAddInputFocus}
        />
        <button
          type="button"
          class={dk.btnPrimary}
          on:mousedown|preventDefault
          on:click={addFreeEntry}
          disabled={!newEntryText.trim()}
          aria-label="Eintrag hinzufügen"
        >+</button>
      </div>
      <footer class="udn-composerFoot udn-composerFoot--mobile">
        <button type="button" class={dk.btn} on:click={openInEditor} disabled={loading}>Notiz</button>
        <button type="button" class={dk.btnPrimary} on:click={save} disabled={loading || saving}>
          {saving ? "…" : "Speichern"}
        </button>
      </footer>
    </div>
  {/if}

  {#if !isMobile}
    <footer class="udn-composerFoot">
      <button type="button" class={dk.btn} on:click={onClose}>Schließen</button>
      <button type="button" class={dk.btn} on:click={openInEditor} disabled={loading}>In Notiz öffnen</button>
      <button type="button" class={dk.btnPrimary} on:click={save} disabled={loading || saving}>
        {saving ? "Speichern…" : "Speichern"}
      </button>
    </footer>
  {/if}
</div>
