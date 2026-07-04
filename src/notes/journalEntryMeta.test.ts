import { describe, expect, it } from "vitest";
import {
  appendEntryMeta,
  formatEntryMetaComment,
  parseEntryMetaComment,
  profileLetter,
  stripEntryMeta,
} from "./journalEntryMeta";

describe("journalEntryMeta", () => {
  it("roundtrips inline metadata", () => {
    const line = '12:00 Abfahrt Hamburg <!-- udn-entry:{"id":"a1b2","profile":"reisen","context":"Mamas 90ter"} -->';
    const { body, meta } = stripEntryMeta(line);
    expect(body).toBe("12:00 Abfahrt Hamburg");
    expect(meta).toEqual({ id: "a1b2", profile: "reisen", context: "Mamas 90ter" });
    expect(appendEntryMeta(body, meta!)).toBe(line);
  });

  it("parses profile letters", () => {
    expect(profileLetter("reisen")).toBe("R");
    expect(profileLetter("wandern")).toBe("W");
    expect(profileLetter("heizung")).toBe("H");
    expect(profileLetter("tagebuch")).toBe("");
  });

  it("formats minimal meta", () => {
    expect(formatEntryMetaComment({ id: "x1" })).toBe('<!-- udn-entry:{"id":"x1"} -->');
  });

  it("returns null for invalid comment", () => {
    expect(parseEntryMetaComment("no meta here")).toBeNull();
  });
});
