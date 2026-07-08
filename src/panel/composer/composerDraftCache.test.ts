import { describe, expect, it } from "vitest";
import {
  clearComposerDraft,
  peekComposerDraft,
  saveComposerDraft,
  type ComposerDraftSnapshot,
} from "./composerDraftCache";

const sampleDraft = (overrides: Partial<ComposerDraftSnapshot> = {}): ComposerDraftSnapshot => ({
  dateKey: "2026-07-08",
  heading: "Tagebuch",
  entries: [],
  summary: "",
  calloutTitle: "",
  listPhotos: [],
  reiseSortOrder: {},
  summaryTouched: false,
  newEntryText: "",
  newEntryTime: "12:00",
  wandernTitel: "",
  ...overrides,
});

describe("composerDraftCache", () => {
  it("stores and restores a draft for the same date and heading", () => {
    clearComposerDraft();
    saveComposerDraft(sampleDraft({ summary: "Entwurf" }));
    expect(peekComposerDraft("2026-07-08", "Tagebuch")?.summary).toBe("Entwurf");
  });

  it("ignores drafts for other dates or headings", () => {
    clearComposerDraft();
    saveComposerDraft(sampleDraft());
    expect(peekComposerDraft("2026-07-07", "Tagebuch")).toBeNull();
    expect(peekComposerDraft("2026-07-08", "Reisen")).toBeNull();
  });

  it("clears the cached draft", () => {
    clearComposerDraft();
    saveComposerDraft(sampleDraft());
    clearComposerDraft();
    expect(peekComposerDraft("2026-07-08", "Tagebuch")).toBeNull();
  });
});
