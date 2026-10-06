// Builds the Generate Report PDF — A4, one page per project, downloaded
// straight to the user's machine. jsPDF is loaded on demand (dynamic import)
// so it only costs bytes when someone actually clicks Download.

export interface ReportPdfProject {
  title: string;
  pm: string;
  status: string;
  statusColor: string;   // hex, e.g. "#16a34a"
  flagged: boolean;      // paused / escalated / closed / on hold — gets a red frame
  assigned: string;
  monthLabel: string;
  hours: { label: string; value: string }[];
  checklist: string[];
  sections: { label: string; text: string }[];
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

export async function downloadProjectReportPdf(projects: ReportPdfProject[], fileName: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  projects.forEach((p, idx) => {
    if (idx > 0) doc.addPage();
    drawProject(doc, p);
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

type Doc = InstanceType<Awaited<typeof import('jspdf')>['jsPDF']>;

function drawProject(doc: Doc, p: ReportPdfProject) {
  // Brand strip + optional red frame for projects needing attention
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, PAGE_W, 4, 'F');
  if (p.flagged) {
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.9);
    doc.rect(6, 8, PAGE_W - 12, PAGE_H - 16);
  }

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

  // Checklist
  heading('Checklist');
  if (p.checklist.length) {
    p.checklist.forEach(item => {
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
  } else {
    paragraph('-', true);
  }
  y += lh * 0.6;

  // Updates
  p.sections.forEach(s => {
    heading(s.label);
    paragraph(s.text.trim() || '-', !s.text.trim());
    y += lh * 0.6;
  });

  return y - startY;
}
