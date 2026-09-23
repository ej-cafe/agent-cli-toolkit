/** 命令行表格与原始 JSON 输出的共享渲染工具。 */

export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += code > 0x7f ? 2 : 1;
  }
  return width;
}

export function padCell(text: string, width: number): string {
  const pad = Math.max(0, width - displayWidth(text));
  return `${text}${" ".repeat(pad)}`;
}

export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) => {
    let max = displayWidth(header);
    for (const row of rows) {
      max = Math.max(max, displayWidth(row[index] ?? "-"));
    }
    return max;
  });
  const lines = [
    headers.map((header, index) => padCell(header, widths[index]!)).join("  "),
    ...rows.map((row) =>
      headers
        .map((_, index) => padCell(row[index] ?? "-", widths[index]!))
        .join("  "),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function cell(value: string | undefined): string {
  return value !== undefined && value !== "" ? value : "-";
}

export function formatRaw(data: Record<string, unknown>): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}
