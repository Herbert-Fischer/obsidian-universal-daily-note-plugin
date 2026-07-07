<script lang="ts">
  import type { FeedProfile } from "../notes/feedMetadata";
  import { profileBubbleClass, profileIconName } from "../notes/journalEntryMeta";
  import { renderProfileIcon } from "../notes/profileIcons";

  export let profile: FeedProfile | undefined = undefined;
  export let title = "Profil zuweisen";
  export let onClick: ((ev: MouseEvent) => void) | undefined = undefined;

  let iconEl: HTMLElement | null = null;

  $: icon = profileIconName(profile);
  $: colorClass = profileBubbleClass(profile);

  $: {
    if (iconEl) renderProfileIcon(iconEl, icon || "circle");
  }
</script>

<button
  type="button"
  class="udn-profileBubble udn-feedLinkBubble {colorClass}"
  class:udn-profileBubble--empty={!icon}
  {title}
  aria-label={title}
  on:click={onClick}
>
  <span class="udn-profileBubbleIconHost" aria-hidden="true" bind:this={iconEl} />
</button>
