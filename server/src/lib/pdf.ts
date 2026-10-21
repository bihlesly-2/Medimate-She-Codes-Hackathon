/**
 * Minimal, dependency-free PDF writer for text reports (A4, Helvetica / Helvetica-Bold, WinAnsi).
 * Standard-14 fonts need no embedding, which keeps the serverless bundle small.
 * Characters outside Latin-1 are replaced with "?".
 */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;

interface Line {
  text: string;
  size: number;
  bold: boolean;
  gray: boolean;
  y: number;
}

export class SimplePdf {
  private pages: Line[][] = [[]];
  private y = PAGE_H - MARGIN;

  private get page() {
    return this.pages[this.pages.length - 1]!;
  }

  private newPage() {
    this.pages.push([]);
    this.y = PAGE_H - MARGIN;
  }

  /** Approximate Helvetica width — good enough for wrapping plain text. */
  private width(text: string, size: number, bold: boolean) {
    return text.length * size * (bold ? 0.56 : 0.52);
  }

  text(text: string, opts: { size?: number; bold?: boolean; gray?: boolean } = {}) {
    const size = opts.size ?? 10;
    const bold = opts.bold ?? false;
    const maxW = PAGE_W - 2 * MARGIN;
    for (const para of text.split('\n')) {
      const words = para.split(/\s+/);
      let line = '';
      const flush = () => {
        if (this.y - size < MARGIN) this.newPage();
        this.y -= size * 1.35;
        this.page.push({ text: line, size, bold, gray: opts.gray ?? false, y: this.y });
        line = '';
      };
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (this.width(next, size, bold) > maxW && line) {
          flush();
          line = w;
        } else line = next;
      }
      flush();
    }
    return this;
  }

  heading(text: string) {
    this.gap(6);
    return this.text(text, { size: 13, bold: true });
  }

  gap(points = 8) {
    this.y -= points;
    if (this.y < MARGIN) this.newPage();
    return this;
  }

  toBuffer(): Buffer {
    const esc = (s: string) =>
      s
        .replace(/[^\x20-\xff]/g, '?')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
    const objects: string[] = [];
    const add = (body: string) => objects.push(body) - 1 + 1; // returns object number
    const catalog = add('');
    const pagesObj = add('');
    const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pageIds: number[] = [];
    this.pages.forEach((lines, i) => {
      const footer = { text: `Page ${i + 1} of ${this.pages.length}`, size: 8, bold: false, gray: true, y: MARGIN / 2 };
      const content = [...lines, footer]
        .map((l) => `BT /${l.bold ? 'F2' : 'F1'} ${l.size} Tf ${l.gray ? '0.4 0.4 0.4' : '0.17 0.18 0.21'} rg ${MARGIN} ${l.y.toFixed(2)} Td (${esc(l.text)}) Tj ET`)
        .join('\n');
      const contentId = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
      pageIds.push(
        add(
          `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`,
        ),
      );
    });
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(Buffer.byteLength(out, 'latin1'));
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  }
}
