<script lang="ts">
  import type { App } from "obsidian";
  import { sidebarPointerAction } from "@denkarium/obsidian-lib-ui";
  import type { FeedProfile } from "../notes/feedMetadata";
  import { displayWikiLinkSegments, feedLinkBubbleClass } from "../notes/feedEntryDisplay";
  import { isUnresolvedWikiLink } from "../notes/resolveWikiLinks";
  import InlineFormattedText from "./InlineFormattedText.svelte";

  export let text = "";
  /** @deprecated Use `text` — kept for existing callers during transition. */
  export let lead = "";
  export let feedProfile: FeedProfile | undefined = undefined;
  export let feedContext = "";
  export let sourcePath = "";
  export let app: App | undefined = undefined;
  export let className = "";
  export let title = "";
  export let onOpenWikiLink: (dest: string, sourcePath: string) => void = () => {};
  export let onDblclick: ((ev: MouseEvent) => void) | undefined = undefined;

  $: displayText = text || lead;
  $: segments = displayWikiLinkSegments(displayText);
  $: hasLinks = segments.some((seg) => seg.kind === "link");

  function linkClass(dest: string): string {
    const broken = app ? isUnresolvedWikiLink(app, dest, sourcePath) : false;
    return feedLinkBubbleClass(dest, feedProfile, broken);
  }

  function linkTitle(dest: string): string {
    if (app && isUnresolvedWikiLink(app, dest, sourcePath)) {
      return "Keine Notiz gefunden — klicken zum Bearbeiten";
    }
    return "";
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<span
  class="udn-timelineEntryBody {className}"
  class:udn-timelineEntryBody--feed={hasLinks}
  {title}
  on:dblclick={onDblclick}
>
  {#each segments as seg, i (i + seg.kind + (seg.kind === "link" ? seg.dest : seg.value))}
    {#if seg.kind === "link"}
      <a
        href="#"
        class="internal-link udn-feedLinkBubble {linkClass(seg.dest)}"
        title={linkTitle(seg.dest)}
        use:sidebarPointerAction={() => onOpenWikiLink(seg.dest, sourcePath)}
      >{seg.label}</a>
    {:else}<InlineFormattedText text={seg.value} />{/if}
  {/each}
</span>
