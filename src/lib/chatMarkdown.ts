/** Markdown → HTML for Debug AI Chat (app-themed tags; CSS owns colors). */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInline(raw: string): string {
  let s = escapeHtml(raw);
  const slots: string[] = [];
  const stash = (html: string): string => {
    const token = `%%MD${slots.length}%%`;
    slots.push(html);
    return token;
  };

  s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_m, alt: string) =>
    stash(`<span class="md-img">${alt}</span>`),
  );
  s = s.replace(/`([^`\n]+)`/g, (_m, code: string) => stash(`<code>${code}</code>`));
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label: string, href: string) =>
    stash(`<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`),
  );
  s = s.replace(
    /(^|[\s(>])(https?:\/\/[^\s<]+[^\s<.,;:!?'")\]])/g,
    (_m, pre: string, href: string) =>
      `${pre}${stash(`<a href="${href}" target="_blank" rel="noreferrer">${href}</a>`)}`,
  );
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  s = s.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(/(^|[^_])_([^_\n]+)_([^_]|$)/g, "$1<em>$2</em>$3");
  return s.replace(/%%MD(\d+)%%/g, (_m, n: string) => slots[Number(n)] ?? "");
}

function isUl(line: string): boolean {
  return /^\s*[-*+]\s+/.test(line) && !isTask(line);
}

function isOl(line: string): boolean {
  return /^\s*\d+\.\s+/.test(line);
}

function isTask(line: string): boolean {
  return /^\s*[-*+]\s+\[[ xX]\]\s+/.test(line);
}

function isHr(line: string): boolean {
  return /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim());
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.includes("|") && !t.startsWith("```");
}

function isTableSep(line: string): boolean {
  return /^[\s|:-]+$/.test(line.trim()) && /-/.test(line);
}

function listItemText(line: string): string {
  return line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "");
}

function splitTableCells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) {
    t = t.slice(1);
  }
  if (t.endsWith("|")) {
    t = t.slice(0, -1);
  }
  return t.split("|").map((c) => c.trim());
}

function quoteDepth(line: string): number {
  const m = /^(?:\s*>)+/.exec(line);
  if (!m) {
    return 0;
  }
  return m[0].replace(/\s/g, "").length;
}

function stripQuote(line: string): string {
  return line.replace(/^\s*>\s?/, "");
}

function isBlockStart(line: string): boolean {
  if (!line.trim()) {
    return true;
  }
  if (/^```/.test(line) || isHr(line) || /^#{1,6}\s+/.test(line)) {
    return true;
  }
  if (isUl(line) || isOl(line) || isTask(line)) {
    return true;
  }
  if (quoteDepth(line) > 0) {
    return true;
  }
  return false;
}

function softBreak(lines: string[]): string {
  return lines.map((l) => formatInline(l)).join("<br>\n");
}

export function markdownToHtml(md: string): string {
  const src = (md || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!src.trim()) {
    return "";
  }
  const lines = src.split("\n");
  const out: string[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    const cleaned = buf.map((l) => l.replace(/\s+$/g, ""));
    while (cleaned.length && cleaned[0] === "") {
      cleaned.shift();
    }
    while (cleaned.length && cleaned[cleaned.length - 1] === "") {
      cleaned.pop();
    }
    if (cleaned.length === 0) {
      return;
    }
    out.push(`<p>${softBreak(cleaned)}</p>`);
    buf.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, "").trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i] ?? "")) {
        code.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) {
        i += 1;
      }
      const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
      const langLabel = lang ? `<div class="md-code-lang">${escapeHtml(lang)}</div>` : "";
      out.push(`<pre${langAttr}>${langLabel}<code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (isHr(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }

    const hm = /^(#{1,6})\s+(.+)$/.exec(line);
    if (hm) {
      const level = Math.min(hm[1]!.length, 4);
      out.push(`<h${level}>${formatInline(hm[2]!.trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1] ?? "")) {
      const header = splitTableCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i] ?? "") && !isTableSep(lines[i] ?? "")) {
        const cells = splitTableCells(lines[i] ?? "");
        while (cells.length < header.length) {
          cells.push("");
        }
        rows.push(cells.slice(0, header.length));
        i += 1;
      }
      const th = header.map((c) => `<th>${formatInline(c)}</th>`).join("");
      const trs = rows
        .map((r) => `<tr>${r.map((c) => `<td>${formatInline(c)}</td>`).join("")}</tr>`)
        .join("");
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`);
      continue;
    }

    if (quoteDepth(line) > 0) {
      const quote: string[] = [];
      while (i < lines.length && quoteDepth(lines[i] ?? "") > 0) {
        quote.push(stripQuote(lines[i] ?? ""));
        i += 1;
      }
      out.push(`<blockquote><p>${softBreak(quote)}</p></blockquote>`);
      continue;
    }

    if (isTask(line)) {
      const items: string[] = [];
      while (i < lines.length && isTask(lines[i] ?? "")) {
        const m = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(lines[i] ?? "");
        const checked = (m?.[1] ?? " ") !== " ";
        const text = m?.[2] ?? "";
        items.push(`<li>${checked ? "☑" : "☐"} ${formatInline(text)}</li>`);
        i += 1;
      }
      out.push(`<ul class="md-task-list">${items.join("")}</ul>`);
      continue;
    }

    if (isUl(line)) {
      const items: string[] = [];
      while (i < lines.length && isUl(lines[i] ?? "")) {
        items.push(`<li>${formatInline(listItemText(lines[i] ?? ""))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (isOl(line)) {
      const items: string[] = [];
      while (i < lines.length && isOl(lines[i] ?? "")) {
        items.push(`<li>${formatInline(listItemText(lines[i] ?? ""))}</li>`);
        i += 1;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (!l.trim() || (isBlockStart(l) && l.trim())) {
        break;
      }
      para.push(l);
      i += 1;
    }
    flushParagraph(para);
  }

  return out.join("\n");
}
