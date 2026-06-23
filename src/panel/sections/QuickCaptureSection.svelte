<script lang="ts">
  import type { App } from "obsidian";
  import { Notice } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { Writable } from "svelte/store";
  import type { TFile } from "obsidian";
  import type { QuickCaptureSettings, DailyNoteFallbackSettings } from "../../settings";
  import { appendTimestampedLogLine } from "../../notes/appendLogLine";
  import { importAttachmentFile, wikiEmbedForPath } from "../../notes/attachJournalMedia";
  import { bumpRefresh, type PanelStore } from "../panelStore";

  export let app: App;
  export let store: PanelStore;
  export let selectedDate: Writable<Date>;
  export let activeFile: Writable<TFile | null>;
  export let quickCapture: QuickCaptureSettings;
  export let fallback: DailyNoteFallbackSettings;
  export let journalHeading = "Tagebuch";

  let text = "";
  let saving = false;
  let selectedPrefix = "";
  let pendingEmbeds: string[] = [];
  let fileInput: HTMLInputElement;

  $: captureHeading =
    quickCapture.syncHeadingWithOutline !== false
      ? journalHeading
      : quickCapture.headingPath ?? journalHeading;

  $: formatHint = `${quickCapture.timeFormat} ${selectedPrefix || "Kategorie:"} …`;

  function togglePrefix(prefix: string) {
    if (selectedPrefix === prefix) {
      selectedPrefix = "";
      return;
    }
    selectedPrefix = prefix;
    const trimmed = text.trimStart();
    const lower = trimmed.toLowerCase();
    const prefixLower = prefix.toLowerCase();
    if (!lower.startsWith(prefixLower)) {
      text = prefix + (trimmed ? ` ${trimmed}` : " ");
    }
  }

  function openFilePicker() {
    fileInput?.click();
  }

  async function onFilesSelected(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    saving = true;
    try {
      for (const file of Array.from(files)) {
        const path = await importAttachmentFile(
          app,
          file,
          $selectedDate,
          quickCapture.attachmentsFolder,
        );
        pendingEmbeds = [...pendingEmbeds, path];
      }
      new Notice(
        pendingEmbeds.length === 1
          ? "Anhang bereit."
          : `${files.length} Anhänge bereit.`,
      );
    } catch (e) {
      console.error("Universal Daily Note: Anhang", e);
      new Notice("Anhang konnte nicht gespeichert werden.");
    } finally {
      saving = false;
      input.value = "";
    }
  }

  function removeEmbed(path: string) {
    pendingEmbeds = pendingEmbeds.filter((p) => p !== path);
  }

  async function submit() {
    const trimmed = text.trim();
    if ((!trimmed && pendingEmbeds.length === 0) || saving) return;
    saving = true;
    try {
      let linkFile: TFile | null = null;
      if (quickCapture.autoLinkActive && $activeFile) {
        linkFile = $activeFile;
      }
      const body = trimmed || pendingEmbeds.map((p) => wikiEmbedForPath(p)).join(" ");
      await appendTimestampedLogLine(app, {
        date: $selectedDate,
        text: body,
        fallback,
        linkFile,
        timeFormat: quickCapture.timeFormat,
        headingPath: captureHeading,
        embedPaths: trimmed ? pendingEmbeds : [],
      });
      text = "";
      selectedPrefix = "";
      pendingEmbeds = [];
      bumpRefresh(store);
      new Notice("Eintrag gespeichert.");
    } catch (e) {
      console.error("Universal Daily Note: Schnelleingabe", e);
      new Notice("Schnelleingabe fehlgeschlagen.");
    } finally {
      saving = false;
    }
  }

  function onKeydown(ev: KeyboardEvent) {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      void submit();
    }
  }
</script>

<div class="udn-capture">
  <div class="udn-captureMeta">
    <span class="udn-captureHeading">→ ## {captureHeading}</span>
    <span class="udn-captureHint">{formatHint}</span>
  </div>

  {#if quickCapture.entryPrefixes?.length}
    <div class="udn-chipRow" role="group" aria-label="Kategorien">
      {#each quickCapture.entryPrefixes as prefix (prefix)}
        <button
          type="button"
          class="udn-chip"
          class:udn-chip--active={selectedPrefix === prefix}
          disabled={saving}
          on:click={() => togglePrefix(prefix)}
        >{prefix.replace(/:$/, "")}</button>
      {/each}
    </div>
  {/if}

  <textarea
    class={dk.textarea}
    placeholder="Schnelleingabe… (Strg/Cmd+Enter)"
    bind:value={text}
    rows="3"
    disabled={saving}
    on:keydown={onKeydown}
  ></textarea>

  {#if pendingEmbeds.length}
    <ul class="udn-captureEmbeds">
      {#each pendingEmbeds as path (path)}
        <li>
          <span class="udn-captureEmbedName">{path.split("/").pop()}</span>
          <button type="button" class={dk.btn} disabled={saving} on:click={() => removeEmbed(path)}>
            Entfernen
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="udn-captureActions">
    <button type="button" class={dk.btn} disabled={saving} on:click={openFilePicker}>
      Anhang…
    </button>
    <button
      type="button"
      class={dk.btnPrimary}
      disabled={saving || (!text.trim() && pendingEmbeds.length === 0)}
      on:click={submit}
    >
      Log
    </button>
  </div>

  <input
    bind:this={fileInput}
    type="file"
    class="udn-hiddenInput"
    accept="image/*,video/*,audio/*,.pdf"
    multiple
    on:change={onFilesSelected}
  />
</div>
