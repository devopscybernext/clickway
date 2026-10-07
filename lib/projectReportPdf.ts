// Builds the Generate Report PDF — A4, one page per project, downloaded
// straight to the user's machine. jsPDF is loaded on demand (dynamic import)
// so it only costs bytes when someone actually clicks Download.

export interface ReportPdfProject {
  title: string;
  pm: string;
  status: string;
  statusColor: string;   // hex, e.g. "#16a34a"
  flagged: boolean;      // paused / escalated / closed / on hold — gets a red "Needs attention" indicator
  assigned: string;
  monthLabel: string;
  hours: { label: string; value: string }[];
  checklist: string[] | null;   // null = the user left Checklist out of the PDF
  sections: { label: string; text: string }[];
}

/** The opening overview page: headline figures + every project with its status. */
export interface ReportPdfSummary {
  /** Small orange label above the title; defaults to PROJECT REPORT. */
  eyebrow?: string;
  pm: string;
  monthLabel: string;
  stats: { label: string; value: string }[];
  projects: { name: string; status: string; statusColor: string; flagged: boolean }[];
}

// jsPDF's built-in fonts only cover Latin-1 — map common typographic
// characters to plain equivalents and anything else unsupported to "?" so the
// PDF never shows garbled glyphs.
function clean(input: string): string {
  return input
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•●▪]/g, '-')
    .replace(/→/g, '->')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '?');
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [107, 114, 128];
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 9;
const BOTTOM_LIMIT = PAGE_H - 16;
const PT_TO_MM = 0.3528;

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [229, 231, 235];
const ORANGE: [number, number, number] = [254, 74, 35];
const RED: [number, number, number] = [239, 68, 68];

export async function downloadProjectReportPdf(projects: ReportPdfProject[], fileName: string, summary?: ReportPdfSummary | null): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Optional overview first, then one page per project. A project can run
  // onto a second page, so each one's *first* page is recorded as it is drawn.
  const rowLinks = summary ? drawSummary(doc, summary) : [];
  const startPage: number[] = [];
  projects.forEach((p, idx) => {
    if (idx > 0 || summary) doc.addPage();
    startPage[idx] = doc.getNumberOfPages();
    drawProject(doc, p);
  });

  finishPdf(doc, rowLinks, startPage, fileName);
}

type Doc = InstanceType<Awaited<typeof import('jspdf')>['jsPDF']>;


// Last step of every PDF: turn each overview row into a link to its project's
// first page, add page-number footers, and save.
function finishPdf(doc: Doc, rowLinks: SummaryRowLink[], startPage: number[], fileName: string) {
  // Make every row of the overview a clickable link to that project's page.
  // This happens last because the target page numbers are only known now;
  // jumping back to the overview page(s) to add the link area is allowed.
  rowLinks.forEach(l => {
    const target = startPage[l.index];
    if (!target) return;
    doc.setPage(l.page);
    // Underlined name + "p.N" so it reads as a link on paper as well
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.2);
    doc.line(MARGIN + 12, l.y + 1.2, l.nameEndX, l.y + 1.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`p.${target}`, l.nameEndX + 3, l.y);
    doc.link(MARGIN, l.y - 5.2, CONTENT_W, ROW_H_LINK, { pageNumber: target });
  });

  // Footer with real page numbers, now that the total is known.
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, MARGIN, FOOTER_Y);
    doc.text(`Page ${i} of ${total}`, PAGE_W - MARGIN, FOOTER_Y, { align: 'right' });
  }

  doc.save(fileName);
}

// Where one overview row was drawn, so it can be turned into a link later.
interface SummaryRowLink { index: number; page: number; y: number; nameEndX: number }
const ROW_H_LINK = 8; // same as the overview list's row height

// The opening page: the same overview figures as the PM Projects screen
// (Total / Current / Pending hours) and the list of every project with its
// status. Long lists continue onto extra pages.
function drawSummary(doc: Doc, s: ReportPdfSummary): SummaryRowLink[] {
  const links: SummaryRowLink[] = [];
  const strip = () => { doc.setFillColor(...ORANGE); doc.rect(0, 0, PAGE_W, 4, 'F'); };
  strip();

  let y = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...ORANGE);
  doc.text(clean(s.eyebrow ?? 'PROJECT REPORT').toUpperCase(), MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  if (s.monthLabel) doc.text(clean(s.monthLabel), PAGE_W - MARGIN, y, { align: 'right' });
  y += 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text('Overview', MARGIN, y);
  y += 6.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  const sub = [s.pm ? `Managed by ${s.pm}` : '', `${s.projects.length} project${s.projects.length === 1 ? '' : 's'}`].filter(Boolean).join('   |   ');
  doc.text(clean(sub), MARGIN, y);
  y += 9;

  // Stat cards in one bordered strip, like the Overview on the screen
  if (s.stats.length) {
    const h = 22;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y, CONTENT_W, h, 2.5, 2.5, 'S');
    const colW = CONTENT_W / s.stats.length;
    s.stats.forEach((st, i) => {
      const x = MARGIN + i * colW;
      if (i > 0) doc.line(x, y + 3, x, y + h - 3);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(clean(st.label).toUpperCase(), x + 6, y + 8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.setTextColor(...INK);
      doc.text(clean(st.value), x + 6, y + 17);
    });
    y += h + 11;
  }

  // Project list
  const header = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('PROJECTS', MARGIN, y);
    doc.setDrawColor(...RULE);
    doc.line(MARGIN, y + 2.5, PAGE_W - MARGIN, y + 2.5);
    y += 8;
  };
  header();

  const ROW_H = 8;
  s.projects.forEach((p, i) => {
    if (y + ROW_H > BOTTOM_LIMIT) {
      doc.addPage();
      strip();
      y = 16;
      header();
    }
    if (i % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(MARGIN, y - 5.2, CONTENT_W, ROW_H, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(String(i + 1), MARGIN + 2, y);

    // Name (clipped to the space left of the status pill)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const nameW = CONTENT_W - 16 - 62;
    const name = (doc.splitTextToSize(clean(p.name || 'Untitled project'), nameW) as string[])[0];
    doc.text(name, MARGIN + 12, y);
    links.push({ index: i, page: doc.getNumberOfPages(), y, nameEndX: MARGIN + 12 + doc.getTextWidth(name) });

    // Status pill, right-aligned
    if (p.status) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const label = clean(p.status);
      const w = doc.getTextWidth(label) + 6;
      const px = PAGE_W - MARGIN - w;
      doc.setFillColor(...hexToRgb(p.statusColor));
      doc.roundedRect(px, y - 4.1, w, 5.6, 2.8, 2.8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(label, px + 3, y);
      if (p.flagged) {
        doc.setFillColor(...RED);
        doc.circle(px - 3.4, y - 1.3, 1.3, 'F');
      }
    }
    y += ROW_H;
  });
  return links;
}

// ─── Details-style PDF (Current Month / Previous Months / Closed Project) ───
// One page per project laid out like the full-details popup: header, then the
// fields grouped in divided rows of four, then the long text stacked below.

/** One labelled value on a details page. */
export interface DetailField {
  label: string;
  value: string;
  /** 'status' = coloured pill (colour in `color`); 'chips' = comma-separated list. */
  kind?: 'text' | 'status' | 'chips';
  color?: string;
}

export interface DetailPdfProject {
  title: string;
  status: string;
  statusColor: string;
  flagged: boolean;
  pm: string;
  assigned: string[];
  monthLabel: string;
  meta: DetailField[];        // Department / Year / Month
  sections: DetailField[][];  // rows of up to four fields
  long: DetailField[];        // Comments, Checklist, Week1-5, Monthly, ...
}

export async function downloadDetailsPdf(
  projects: DetailPdfProject[],
  fileName: string,
  summary: ReportPdfSummary | null,
  eyebrow: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const rowLinks = summary ? drawSummary(doc, summary) : [];
  const startPage: number[] = [];
  projects.forEach((p, idx) => {
    if (idx > 0 || summary) doc.addPage();
    startPage[idx] = doc.getNumberOfPages();
    drawDetails(doc, p, eyebrow);
  });

  finishPdf(doc, rowLinks, startPage, fileName);
}

function drawDetails(doc: Doc, p: DetailPdfProject, eyebrow: string) {
  doc.setFillColor(...(p.flagged ? RED : ORANGE));
  doc.rect(0, 0, PAGE_W, 4, 'F');

  let y = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...ORANGE);
  doc.text(clean(eyebrow).toUpperCase(), MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  if (p.monthLabel) doc.text(clean(p.monthLabel), PAGE_W - MARGIN, y, { align: 'right' });
  y += 8;

  // Title (up to two lines)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  (doc.splitTextToSize(clean(p.title || 'Untitled project'), CONTENT_W) as string[]).slice(0, 2)
    .forEach(line => { doc.text(line, MARGIN, y); y += 8.5; });
  y += 1;

  // Status pill, attention indicator, Managed by
  let x = MARGIN;
  if (p.status) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    const label = clean(p.status);
    const w = doc.getTextWidth(label) + 7;
    doc.setFillColor(...hexToRgb(p.statusColor));
    doc.roundedRect(x, y - 4.6, w, 6.6, 3.3, 3.3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, x + 3.5, y);
    x += w + 5;
  }
  if (p.flagged) {
    doc.setFillColor(...RED);
    doc.circle(x + 1.6, y - 1.3, 1.6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...RED);
    doc.text('Needs attention', x + 5, y);
    x += 5 + doc.getTextWidth('Needs attention') + 5;
  }
  if (p.pm) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text(clean(`Managed by ${p.pm}`), x, y);
  }
  y += 9;

  // Assigned chips (wrap onto further lines when needed)
  if (p.assigned.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text('ASSIGNED', MARGIN, y);
    y += 3.6;
    let cx = MARGIN;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    p.assigned.forEach(name => {
      const label = clean(name);
      const w = doc.getTextWidth(label) + 6;
      if (cx + w > PAGE_W - MARGIN) { cx = MARGIN; y += 7; }
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(cx, y, w, 5.6, 2.8, 2.8, 'F');
      doc.setTextColor(...INK);
      doc.text(label, cx + 3, y + 4);
      cx += w + 2;
    });
    y += 12;
  }

  // Department / Year / Month
  if (p.meta.length) {
    let mx = MARGIN;
    p.meta.forEach(m => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(clean(m.label).toUpperCase(), mx, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      const v = clean(m.value || '-');
      doc.text(v, mx, y + 4.4);
      mx += Math.max(doc.getTextWidth(v), 14) + 12;
    });
    y += 8.5;
  }

  // Body — largest long-text font that keeps the project on one page.
  const sizes = [9.5, 9, 8.5, 8, 7.5, 7];
  let fs = sizes[sizes.length - 1];
  for (const candidate of sizes) {
    if (y + runDetailsBody(doc, p, candidate, 0, true) <= BOTTOM_LIMIT) { fs = candidate; break; }
  }
  runDetailsBody(doc, p, fs, y, false);
}

// One walker for measuring (dry) and drawing, so the two can't drift apart.
function runDetailsBody(doc: Doc, p: DetailPdfProject, fs: number, startY: number, dry: boolean): number {
  let y = startY;
  const lh = lineHeight(fs);
  const ensureRoom = (needed: number) => {
    if (!dry && y + needed > BOTTOM_LIMIT) {
      doc.addPage();
      doc.setFillColor(...ORANGE);
      doc.rect(0, 0, PAGE_W, 4, 'F');
      y = 16;
    }
  };

  // Rows of up to four fields, each row under a divider
  const colW = CONTENT_W / 4;
  p.sections.filter(sec => sec.length).forEach(sec => {
    ensureRoom(20);
    if (!dry) {
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.25);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    }
    y += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const cells = sec.map(f => ({ f, lines: f.kind === 'status' ? [] : (doc.splitTextToSize(clean(f.value || '-'), colW - 5) as string[]) }));
    const valueH = Math.max(...cells.map(c => (c.f.kind === 'status' ? 6.5 : c.lines.length * 4.2)));
    ensureRoom(4.6 + valueH + 4);
    if (!dry) {
      cells.forEach((c, i) => {
        const cx = MARGIN + i * colW;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        doc.text(clean(c.f.label).toUpperCase(), cx, y);
        if (c.f.kind === 'status' && c.f.value) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          const label = clean(c.f.value);
          const w = Math.min(doc.getTextWidth(label) + 6, colW - 3);
          doc.setFillColor(...hexToRgb(c.f.color || '#6b7280'));
          doc.roundedRect(cx, y + 1.6, w, 5.4, 2.7, 2.7, 'F');
          doc.setTextColor(255, 255, 255);
          doc.text(label, cx + 3, y + 5.3);
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          if (c.f.value) doc.setTextColor(...INK); else doc.setTextColor(156, 163, 175);
          c.lines.forEach((line, li) => doc.text(line, cx, y + 5 + li * 4.2));
        }
      });
    }
    y += 4.6 + valueH + 4;
  });

  // Long text, stacked full width
  if (p.long.length) {
    ensureRoom(14);
    if (!dry) {
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.25);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    }
    y += 5.5;
  }
  const headingFs = Math.max(fs - 2, 6.5);
  p.long.forEach(f => {
    ensureRoom(headingFs * PT_TO_MM + lh);
    if (!dry) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(headingFs);
      doc.setTextColor(...MUTED);
      doc.text(clean(f.label).toUpperCase(), MARGIN, y);
    }
    y += headingFs * PT_TO_MM * 1.5 + 0.8;

    const items = f.kind === 'chips' ? f.value.split(',').map(s => s.trim()).filter(Boolean) : [];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fs);
    if (f.kind === 'chips' && items.length) {
      items.forEach(item => {
        const lines = doc.splitTextToSize(clean(item), CONTENT_W - 6) as string[];
        lines.forEach((line, i) => {
          ensureRoom(lh);
          if (!dry) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(fs);
            doc.setTextColor(...INK);
            if (i === 0) { doc.setFillColor(...ORANGE); doc.circle(MARGIN + 1.2, y - fs * PT_TO_MM * 0.32, 0.6, 'F'); }
            doc.text(line, MARGIN + 5, y);
          }
          y += lh;
        });
      });
    } else {
      const text = f.value.trim();
      const lines = doc.splitTextToSize(clean(text || '-'), CONTENT_W) as string[];
      lines.forEach(line => {
        ensureRoom(lh);
        if (!dry) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(fs);
          if (text) doc.setTextColor(...INK); else doc.setTextColor(156, 163, 175);
          doc.text(line, MARGIN, y);
        }
        y += lh;
      });
    }
    y += lh * 0.6;
  });

  return y - startY;
}

function drawProject(doc: Doc, p: ReportPdfProject) {
  // Brand strip — turns red for projects needing attention
  doc.setFillColor(...(p.flagged ? RED : ORANGE));
  doc.rect(0, 0, PAGE_W, 4, 'F');

  let y = 16;

  // Eyebrow row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...ORANGE);
  doc.text('PROJECT REPORT', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  if (p.monthLabel) doc.text(clean(p.monthLabel), PAGE_W - MARGIN, y, { align: 'right' });
  y += 8;

  // Title (up to 2 lines)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  const titleLines = (doc.splitTextToSize(clean(p.title || 'Untitled project'), CONTENT_W) as string[]).slice(0, 2);
  titleLines.forEach(line => { doc.text(line, MARGIN, y); y += 8.5; });
  y += 1;

  // Status pill + people
  let x = MARGIN;
  if (p.status) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    const label = clean(p.status);
    const w = doc.getTextWidth(label) + 7;
    doc.setFillColor(...hexToRgb(p.statusColor));
    doc.roundedRect(x, y - 4.6, w, 6.6, 3.3, 3.3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, x + 3.5, y);
    x += w + 5;
  }
  // Status indicator for projects needing attention: red dot + label
  if (p.flagged) {
    doc.setFillColor(...RED);
    doc.circle(x + 1.6, y - 1.3, 1.6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...RED);
    doc.text('Needs attention', x + 5, y);
    x += 5 + doc.getTextWidth('Needs attention') + 5;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  const people = [p.pm ? `Managed by ${p.pm}` : '', p.assigned ? `Assigned: ${p.assigned}` : ''].filter(Boolean).join('   |   ');
  if (people) {
    const lines = (doc.splitTextToSize(clean(people), PAGE_W - MARGIN - x) as string[]).slice(0, 2);
    lines.forEach((line, i) => doc.text(line, x, y + i * 4.5));
    y += (lines.length - 1) * 4.5;
  }
  y += 8;

  // Hours boxes
  if (p.hours.length) {
    const gap = 4;
    const boxW = (CONTENT_W - gap * (p.hours.length - 1)) / p.hours.length;
    p.hours.forEach((h, i) => {
      const bx = MARGIN + i * (boxW + gap);
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(bx, y, boxW, 15, 2, 2, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(clean(h.label).toUpperCase(), bx + 4, y + 5.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...INK);
      doc.text(clean(h.value || '-'), bx + 4, y + 11.8);
    });
    y += 15 + 6;
  }

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;

  // Body — pick the largest font size that keeps the whole project on one
  // page; if even the smallest overflows, it simply continues onto a new page.
  const sizes = [10, 9.5, 9, 8.5, 8, 7.5];
  let fs = sizes[sizes.length - 1];
  for (const candidate of sizes) {
    if (y + measureBody(doc, p, candidate) <= BOTTOM_LIMIT) { fs = candidate; break; }
  }
  drawBody(doc, p, fs, y);
}

function lineHeight(fs: number): number { return fs * PT_TO_MM * 1.4; }

function measureBody(doc: Doc, p: ReportPdfProject, fs: number): number {
  return runBody(doc, p, fs, 0, true);
}
function drawBody(doc: Doc, p: ReportPdfProject, fs: number, y: number) {
  runBody(doc, p, fs, y, false);
}

// One walker for both measuring (dry) and drawing, so they can't drift apart.
function runBody(doc: Doc, p: ReportPdfProject, fs: number, startY: number, dry: boolean): number {
  const lh = lineHeight(fs);
  const headingFs = Math.max(fs - 1.5, 7);
  let y = startY;

  const ensureRoom = (needed: number) => {
    if (!dry && y + needed > BOTTOM_LIMIT) {
      doc.addPage();
      doc.setFillColor(...ORANGE);
      doc.rect(0, 0, PAGE_W, 4, 'F');
      y = 16;
    }
  };
  const heading = (text: string) => {
    ensureRoom(headingFs * PT_TO_MM + lh);
    if (!dry) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(headingFs);
      doc.setTextColor(...MUTED);
      doc.text(clean(text).toUpperCase(), MARGIN, y);
    }
    y += headingFs * PT_TO_MM * 1.5;
  };
  const paragraph = (text: string, muted: boolean) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fs);
    const lines = doc.splitTextToSize(clean(text), CONTENT_W) as string[];
    lines.forEach(line => {
      ensureRoom(lh);
      if (!dry) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fs);
        if (muted) doc.setTextColor(...MUTED); else doc.setTextColor(...INK);
        doc.text(line, MARGIN, y);
      }
      y += lh;
    });
  };

  // Checklist (skipped entirely when the user left it out)
  const checklist = p.checklist;
  if (checklist) heading('Checklist');
  if (checklist && checklist.length) {
    checklist.forEach(item => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fs);
      const lines = doc.splitTextToSize(clean(item), CONTENT_W - 6) as string[];
      lines.forEach((line, i) => {
        ensureRoom(lh);
        if (!dry) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(fs);
          doc.setTextColor(...INK);
          if (i === 0) {
            doc.setFillColor(...ORANGE);
            doc.circle(MARGIN + 1.2, y - fs * PT_TO_MM * 0.32, 0.6, 'F');
          }
          doc.text(line, MARGIN + 5, y);
        }
        y += lh;
      });
    });
  } else if (checklist) {
    paragraph('-', true);
  }
  if (checklist) y += lh * 0.6;

  // Updates
  p.sections.forEach(s => {
    heading(s.label);
    paragraph(s.text.trim() || '-', !s.text.trim());
    y += lh * 0.6;
  });

  return y - startY;
}
