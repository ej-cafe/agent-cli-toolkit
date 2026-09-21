import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cell,
  displayWidth,
  formatRaw,
  formatTable,
  padCell,
} from "../src/platforms/format.js";

describe("displayWidth", () => {
  it("counts ASCII as 1", () => {
    assert.equal(displayWidth("abc"), 3);
  });

  it("counts CJK as 2", () => {
    assert.equal(displayWidth("窗口"), 4);
  });

  it("mixed text", () => {
    assert.equal(displayWidth("7 天窗口"), 8);
  });
});

describe("padCell", () => {
  it("pads ASCII to width", () => {
    assert.equal(padCell("ab", 5), "ab   ");
  });

  it("pads by display width, not code units", () => {
    assert.equal(padCell("窗口", 6), "窗口  ");
  });

  it("does not truncate over-wide text", () => {
    assert.equal(padCell("窗口", 1), "窗口");
  });
});

describe("formatTable", () => {
  it("renders aligned rows", () => {
    const text = formatTable(
      ["窗口", "已用"],
      [
        ["7 天窗口", "10%"],
        ["5 小时窗口", "8%"],
      ],
    );
    const lines = text.split("\n");
    assert.equal(lines.length, 4); // header + 2 rows + 尾部换行
    assert.ok(lines[1]!.startsWith("7 天窗口"));
    // 第二列起始显示列号在 header 与各行一致（按显示宽度对齐，含 CJK 补偿）
    const displayColumn = (line: string, marker: string): number =>
      displayWidth(line.slice(0, line.indexOf(marker)));
    assert.equal(displayColumn(lines[0]!, "已用"), displayColumn(lines[1]!, "10%"));
    assert.equal(displayColumn(lines[0]!, "已用"), displayColumn(lines[2]!, "8%"));
  });

  it("fills missing cells with dash", () => {
    const text = formatTable(["a", "b"], [["x"]]);
    assert.ok(text.includes("x  -"));
  });
});

describe("cell", () => {
  it("undefined and empty become dash", () => {
    assert.equal(cell(undefined), "-");
    assert.equal(cell(""), "-");
  });

  it("keeps non-empty value", () => {
    assert.equal(cell("10%"), "10%");
  });
});

describe("formatRaw", () => {
  it("pretty-prints JSON with trailing newline", () => {
    assert.equal(formatRaw({ a: 1 }), '{\n  "a": 1\n}\n');
  });
});
