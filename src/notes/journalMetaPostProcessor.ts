import type { Plugin } from "obsidian";
import { UDN_META_COMMENT_RE } from "./journalEntryMeta";

/** Hide plugin metadata comments that Obsidian may render inside callout bullets. */
export function registerJournalMetaPostProcessor(plugin: Plugin): void {
  plugin.registerMarkdownPostProcessor((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent ?? "";
      if (text.includes("<!--") && text.includes("udn-")) {
        nodes.push(node as Text);
      }
      node = walker.nextNode();
    }
    for (const textNode of nodes) {
      const cleaned = (textNode.textContent ?? "").replace(UDN_META_COMMENT_RE, "");
      if (cleaned !== textNode.textContent) {
        textNode.textContent = cleaned;
      }
    }
  });
}
