<script lang="ts">
  import { dk } from "@denkarium/obsidian-lib-ui";
  import {
    composerTimeInputValue,
    normalizeComposerTimeValue,
    openComposerTimePicker,
  } from "./composerTimeField";

  export let value = "";
  export let isMobile = false;
  export let ariaLabel = "Zeit";
  export let placeholder = "HH:mm";
  export let onChange: (value: string) => void = () => {};
  export let onFocus: (ev: FocusEvent) => void = () => {};

  let pickerEl: HTMLInputElement | undefined;

  $: normalized = normalizeComposerTimeValue(value);
  $: displayText = (isMobile ? normalized : value.trim()) || placeholder;
  $: pickerValue = composerTimeInputValue(value, true);

  function onTextInput(ev: Event) {
    onChange((ev.currentTarget as HTMLInputElement).value);
  }

  function onPickerInput(ev: Event) {
    const raw = (ev.currentTarget as HTMLInputElement).value;
    onChange(normalizeComposerTimeValue(raw) || raw);
  }

  function openPicker(ev: MouseEvent) {
    ev.stopPropagation();
    if (!pickerEl) return;
    openComposerTimePicker(pickerEl);
    onFocus(ev as unknown as FocusEvent);
  }
</script>

{#if isMobile}
  <div class="udn-timeBubbleWrap">
    <button
      type="button"
      class="{dk.input} udn-timeBubble udn-timeBubbleInput udn-timeBubbleDisplay"
      class:udn-timeBubbleDisplay--placeholder={!normalized}
      aria-label={ariaLabel}
      on:click={openPicker}
    >
      {displayText}
    </button>
    <input
      bind:this={pickerEl}
      type="time"
      class="udn-timeBubblePicker"
      value={pickerValue}
      step="60"
      tabindex="-1"
      aria-hidden="true"
      on:input={onPickerInput}
    />
  </div>
{:else}
  <input
    type="text"
    class="{dk.input} udn-timeBubble udn-timeBubbleInput"
    {value}
    {placeholder}
    aria-label={ariaLabel}
    on:input={onTextInput}
    on:focus={onFocus}
  />
{/if}
