<script lang="ts">
  import { dk } from "@denkarium/obsidian-lib-ui";

  export let feedTime = "";
  export let feedKurz = "";
  export let detail = "";
  export let calloutTitle = "";
  export let onFeedTimeChange: (v: string) => void = () => {};
  export let onFeedKurzChange: (v: string) => void = () => {};
  export let onDetailChange: (v: string) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

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

<div class="udn-wandernForm udn-feedDetailForm udn-sonstigesForm">
  <div class="udn-feedDetailFeedBlock">
    <span class="udn-composerSummaryLabel">Tagebuch-Feed</span>
    <p class="udn-composerHint">
      Erscheint in ## Tagebuch — Kurztext standardmäßig = Callout-Titel ({calloutTitle || "Sonstiges"}).
    </p>
    <div class="udn-composerAddRow udn-feedDetailFeedRow">
      <input
        type="text"
        class="{dk.input} udn-timeBubble udn-timeBubbleInput"
        value={feedTime}
        on:input={(ev) => onFeedTimeChange(inputValue(ev))}
        on:focus={focusTarget}
        placeholder="HH:mm"
        aria-label="Zeit im Tagebuch"
      />
      <input
        type="text"
        class="{dk.input} udn-composerSummaryInput udn-feedDetailFeedInput"
        value={feedKurz}
        on:input={(ev) => onFeedKurzChange(inputValue(ev))}
        on:focus={focusTarget}
        placeholder="Kurzzeile im Tagebuch (optional)"
      />
    </div>
  </div>

  <label class="udn-composerSummary udn-sonstigesDetail">
    <span class="udn-composerSummaryLabel">Erläuterung im Callout</span>
    <textarea
      class="{dk.input} udn-composerSummaryInput udn-sonstigesDetailInput"
      rows="6"
      value={detail}
      on:input={(ev) => onDetailChange(textareaValue(ev))}
      on:focus={focusTarget}
      placeholder="Fließtext — Absätze mit Zeilenumbruch. Keine Bullet-Liste nötig."
    ></textarea>
  </label>
</div>
