import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Real report (screenshot): a long note's "Lưu trữ" button rendered as a
// huge empty vertical column stretching the full height of the note's text,
// with the button's label floating centered in the middle of that empty
// space. Root cause: the row wrapping the note's content and its archive
// button is a flex row with no alignItems set, so it defaults to "stretch"
// — both the content div and the button get stretched to match whichever
// is tallest. A long note (many lines of content) stretches the button to
// match, and .button's own inline-flex centering then centers "Lưu trữ"
// inside that tall box. Fixed with alignItems:"flex-start" so the button
// keeps its natural height regardless of how long the note's content is.
describe("Sổ tay cá nhân note row: the Lưu trữ/Khôi phục button doesn't stretch to match a long note's height", () => {
  it("sets alignItems:flex-start on the note row flex container", () => {
    const source = readFileSync("src/components/knowledge-journal-client.tsx", "utf8");
    expect(source).toContain('style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap",minWidth:0}}');
  });
});
