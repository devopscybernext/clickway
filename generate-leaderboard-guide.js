const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ margin: 50, size: 'A4' });
const outPath = path.join(__dirname, 'Cybernext_Leaderboard_Guide.pdf');
doc.pipe(fs.createWriteStream(outPath));

// ── Colours ──────────────────────────────────────────────────────────────────
const ORANGE  = '#FE4A23';
const DARK    = '#111111';
const MUTED   = '#555555';
const LIGHT   = '#f4f4f5';
const GREEN   = '#16a34a';
const GOLD    = '#E59400';
const PURPLE  = '#6d28d9';
const BLUE    = '#2563eb';
const TEAL    = '#06b6d4';
const LIME    = '#84cc16';

// ── Helpers ───────────────────────────────────────────────────────────────────
function sectionTitle(text) {
  doc.moveDown(1);
  doc.rect(50, doc.y, 495, 28).fill(ORANGE);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(13)
     .text(text, 60, doc.y - 22, { width: 475 });
  doc.fillColor(DARK).moveDown(0.6);
}

function subTitle(text) {
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK).text(text);
  doc.moveDown(0.3);
}

function bodyText(text) {
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(text, { lineGap: 3 });
  doc.moveDown(0.3);
}

function bullet(text) {
  doc.font('Helvetica').fontSize(10).fillColor(MUTED)
     .text(`•  ${text}`, { indent: 15, lineGap: 2 });
}

function tableRow(cols, widths, y, isHeader = false, bg = null) {
  const x0 = 50;
  let x = x0;
  const rowH = 22;

  if (bg) doc.rect(x0, y, widths.reduce((a,b)=>a+b,0), rowH).fill(bg);
  doc.rect(x0, y, widths.reduce((a,b)=>a+b,0), rowH).stroke('#ccc');

  cols.forEach((col, i) => {
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
       .fontSize(isHeader ? 10 : 9.5)
       .fillColor(isHeader ? '#fff' : DARK)
       .text(String(col), x + 5, y + 6, { width: widths[i] - 10, ellipsis: true });
    x += widths[i];
    if (i < cols.length - 1)
      doc.moveTo(x, y).lineTo(x, y + rowH).stroke('#ccc');
  });
  return y + rowH;
}

// ══════════════════════════════════════════════════════════════════════════════
// COVER PAGE
// ══════════════════════════════════════════════════════════════════════════════
doc.rect(0, 0, 595, 842).fill('#0a0a0a');
doc.rect(0, 0, 595, 6).fill(ORANGE);

doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(32)
   .text('CYBERNEXT', 50, 120, { align: 'center' });

doc.fillColor('#fff').font('Helvetica-Bold').fontSize(22)
   .text('Team Leaderboard', 50, 175, { align: 'center' });

doc.fillColor(ORANGE).font('Helvetica').fontSize(14)
   .text('Official Guide & Scoring Reference', 50, 210, { align: 'center' });

// divider
doc.rect(175, 250, 245, 2).fill(ORANGE);

doc.fillColor('#ccc').font('Helvetica').fontSize(11)
   .text('Performance-based ranking system for the Cybernext team.', 50, 270, { align: 'center' })
   .text('Scores are calculated from task delivery, quality and complexity.', 50, 290, { align: 'center' });

doc.fillColor('#888').fontSize(10)
   .text(`Generated: ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })}`, 50, 360, { align: 'center' });

doc.fillColor(ORANGE).fontSize(10)
   .text('Leaderboard active from: June 2026', 50, 380, { align: 'center' });

doc.rect(0, 836, 595, 6).fill(ORANGE);
doc.addPage();

// ══════════════════════════════════════════════════════════════════════════════
// TABLE OF CONTENTS
// ══════════════════════════════════════════════════════════════════════════════
doc.fillColor(DARK).font('Helvetica-Bold').fontSize(18).text('Table of Contents', 50, 60);
doc.rect(50, 85, 495, 2).fill(ORANGE);
doc.moveDown(1);

const toc = [
  ['1.', 'Overview & Purpose'],
  ['2.', 'How Points Are Earned'],
  ['3.', 'Scoring Reference Table'],
  ['4.', 'Time-Based Points Explained'],
  ['5.', 'Milestone Bonuses'],
  ['6.', 'Priority & Task Info Bonuses'],
  ['7.', 'Objectives Completed (Manual Bonus)'],
  ['8.', 'Leaderboard Filters & Periods'],
  ['9.', 'Dashboard Widget'],
  ['10.', 'Rules & Fair Play'],
  ['11.', 'Future Plans'],
];

toc.forEach(([num, title]) => {
  doc.font('Helvetica').fontSize(11).fillColor(DARK)
     .text(`${num}  ${title}`, 70, doc.y, { continued: false });
  doc.moveDown(0.4);
});
doc.addPage();

// ══════════════════════════════════════════════════════════════════════════════
// 1. OVERVIEW
// ══════════════════════════════════════════════════════════════════════════════
sectionTitle('1.  Overview & Purpose');
bodyText('The Cybernext Team Leaderboard is a performance recognition system that rewards team members based on the quality, complexity, and quantity of work they deliver. It was designed to:');
bullet('Motivate consistent high-quality output');
bullet('Reward complexity — harder tasks earn more points');
bullet('Recognize PM-approved work and client-ready deliverables');
bullet('Track monthly and all-time top performers');
bullet('Provide management with a clear, objective performance view');
doc.moveDown(0.5);
bodyText('The leaderboard is visible to Admin and Higher Management only. Data is drawn automatically from the Bandwidth Allocation Google Sheet and recalculated on every page refresh.');
doc.moveDown(0.5);
doc.font('Helvetica-Bold').fontSize(10).fillColor(ORANGE)
   .text('Note: Leaderboard data starts from June 2026. Historical data before June is excluded.');

// ══════════════════════════════════════════════════════════════════════════════
// 2. HOW POINTS ARE EARNED
// ══════════════════════════════════════════════════════════════════════════════
sectionTitle('2.  How Points Are Earned');
bodyText('Points are awarded automatically when a task\'s status or PM status changes in the system. There are 6 scoring categories:');
doc.moveDown(0.3);

const categories = [
  ['A', 'Task Status', 'Points based on final task status × time estimation', ORANGE],
  ['B', 'PM Status', 'Points based on PM approval × time estimation', GOLD],
  ['C', 'Task Priority', 'Bonus points for tackling high-priority tasks', '#ef4444'],
  ['D', 'Task Information', 'Bonus for task type (New task vs Running task)', PURPLE],
  ['E', 'Milestone Bonuses', 'Bonus every time 10 tasks are closed or PM-approved', GREEN],
  ['F', 'Objectives Completed', 'Manual bonus awarded by admin for special achievements', ORANGE],
];

categories.forEach(([letter, name, desc, color]) => {
  const y = doc.y;
  doc.rect(50, y, 30, 28).fill(color);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(13)
     .text(letter, 58, y + 7);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
     .text(name, 92, y + 4);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9)
     .text(desc, 92, y + 16, { width: 400 });
  doc.moveDown(1.2);
});

doc.addPage();

// ══════════════════════════════════════════════════════════════════════════════
// 3. SCORING REFERENCE TABLE
// ══════════════════════════════════════════════════════════════════════════════
sectionTitle('3.  Scoring Reference Table');
bodyText('Complete reference of all scoring rules:');
doc.moveDown(0.3);

const W = [220, 130, 145];
let y = doc.y;
y = tableRow(['Action / Status', 'Points', 'Notes'], W, y, true, DARK);
const rows = [
  ['Submitted To PM', '5 – 60 pts', 'Half of time-based scale'],
  ['Task Closed', '10 – 120 pts', 'Full time-based scale'],
  ['PM Approved', '10 – 120 pts', 'Full time-based scale'],
  ['PM → Submitted To Client', '10 – 120 pts', 'Full time-based scale'],
  ['Priority: Urgent', '+15 pts', 'Per task'],
  ['Priority: High', '+10 pts', 'Per task'],
  ['Priority: Medium', '+5 pts', 'Per task'],
  ['Priority: Low', '+5 pts', 'Per task'],
  ['Task Info: New', '+10 pts', 'Per task'],
  ['Task Info: Running', '+5 pts', 'Per task'],
  ['Milestone: Every 10 Tasks Closed', '+20 pts', 'Per milestone reached'],
  ['Milestone: Every 10 PM Approved', '+20 pts', 'Per milestone reached'],
  ['Objectives Completed', '800 – 1200 pts', 'Manual bonus by admin'],
];

rows.forEach((row, i) => {
  const bg = i % 2 === 0 ? '#f9f9f9' : '#ffffff';
  y = tableRow(row, W, y, false, bg);
});

doc.addPage();

// ══════════════════════════════════════════════════════════════════════════════
// 4. TIME-BASED POINTS
// ══════════════════════════════════════════════════════════════════════════════
sectionTitle('4.  Time-Based Points Explained');
bodyText('Task Closed, PM Approved, and Submitted To Client are NOT flat points. The system looks at the "Time Estimation" column of each task and awards points based on task complexity:');
doc.moveDown(0.5);

const TW = [140, 120, 120, 120];
let ty = doc.y;
ty = tableRow(['Time Estimation', 'Task Closed', 'PM Approved / Submitted To Client', 'Submitted To PM'], TW, ty, true, DARK);
const timeRows = [
  ['< 1 hour',    '10 pts',  '10 pts',  '5 pts'],
  ['1 – 2 hours', '20 pts',  '20 pts',  '10 pts'],
  ['3 – 4 hours', '30 pts',  '30 pts',  '15 pts'],
  ['4 – 6 hours', '40 pts',  '40 pts',  '20 pts'],
  ['6 – 9 hours', '50 pts',  '50 pts',  '25 pts'],
  ['10 – 15 hours','65 pts', '65 pts',  '33 pts'],
  ['16 – 20 hours','80 pts', '80 pts',  '40 pts'],
  ['21 – 30 hours','100 pts','100 pts', '50 pts'],
  ['30+ hours',   '120 pts', '120 pts', '60 pts'],
];
timeRows.forEach((row, i) => {
  const bg = i % 2 === 0 ? '#f9f9f9' : '#ffffff';
  ty = tableRow(row, TW, ty, false, bg);
});

doc.moveDown(1);
doc.rect(50, doc.y, 495, 45).fill('#fff7ed').stroke(ORANGE);
doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(10)
   .text('Why time-based scoring?', 60, doc.y - 40);
doc.fillColor(MUTED).font('Helvetica').fontSize(9)
   .text('A 1-hour quick fix and a 25-hour complex feature are not equal. Time-based scoring ensures fair reward — the harder the task, the more points earned. This prevents inflating scores with many trivial tasks.', 60, doc.y - 28, { width: 475 });

doc.addPage();

// ══════════════════════════════════════════════════════════════════════════════
// 5. MILESTONE BONUSES
// ══════════════════════════════════════════════════════════════════════════════
sectionTitle('5.  Milestone Bonuses');
bodyText('Every time a team member reaches a multiple of 10 tasks in a category, they earn a bonus:');
doc.moveDown(0.5);

const MW = [220, 100, 175];
let my = doc.y;
my = tableRow(['Milestone', 'Bonus', 'Example'], MW, my, true, DARK);
const milestoneRows = [
  ['Every 10 Tasks Closed',       '+20 pts', '10 closed = +20, 20 closed = +40'],
  ['Every 10 PM Approved tasks',  '+20 pts', '10 approved = +20, 20 = +40'],
];
milestoneRows.forEach((row, i) => {
  my = tableRow(row, MW, my, false, i % 2 === 0 ? '#f9f9f9' : '#fff');
});
doc.moveDown(0.5);
bodyText('Milestones accumulate over the entire period selected (All Time, This Month, This Week). They reset when the filter changes.');

// ══════════════════════════════════════════════════════════════════════════════
// 6. PRIORITY & TASK INFO BONUSES
// ══════════════════════════════════════════════════════════════════════════════
sectionTitle('6.  Priority & Task Info Bonuses');
bodyText('Additional bonus points are awarded per task based on the Priority and Task Information fields:');
doc.moveDown(0.3);
subTitle('Task Priority Bonuses');
const PW = [160, 100, 235];
let py = doc.y;
py = tableRow(['Priority Level', 'Bonus', 'Purpose'], PW, py, true, DARK);
[
  ['Urgent', '+15 pts', 'Critical / time-sensitive tasks'],
  ['High',   '+10 pts', 'Important tasks with deadlines'],
  ['Medium', '+5 pts',  'Standard tasks'],
  ['Low',    '+5 pts',  'Background / nice-to-have tasks'],
].forEach((row, i) => {
  py = tableRow(row, PW, py, false, i % 2 === 0 ? '#f9f9f9' : '#fff');
});

doc.moveDown(0.8);
subTitle('Task Information Bonuses');
const IW = [160, 100, 235];
let iy = doc.y;
iy = tableRow(['Task Type', 'Bonus', 'Purpose'], IW, iy, true, DARK);
[
  ['New',     '+10 pts', 'Brand-new feature or task'],
  ['Running', '+5 pts',  'Ongoing / in-flight task'],
].forEach((row, i) => {
  iy = tableRow(row, IW, iy, false, i % 2 === 0 ? '#f9f9f9' : '#fff');
});

doc.addPage();

// ══════════════════════════════════════════════════════════════════════════════
// 7. OBJECTIVES COMPLETED
// ══════════════════════════════════════════════════════════════════════════════
sectionTitle('7.  Objectives Completed (Manual Bonus)');
bodyText('The "Objectives Completed" bonus is a manual award given by the Admin for exceptional performance, special achievements, or goals beyond regular task delivery.');
doc.moveDown(0.3);

const OW = [160, 110, 225];
let oy = doc.y;
oy = tableRow(['Tier', 'Points Range', 'When to award'], OW, oy, true, DARK);
[
  ['Standard Achievement', '800 pts',       'Meeting a major project objective'],
  ['High Achievement',     '1000 pts',      'Exceptional delivery or client feedback'],
  ['Outstanding',          '1200 pts',      'Above-and-beyond performance'],
].forEach((row, i) => {
  oy = tableRow(row, OW, oy, false, i % 2 === 0 ? '#f9f9f9' : '#fff');
});

doc.moveDown(0.8);
bodyText('How to add Objectives Completed points:');
bullet('Open the Google Sheet → "Leaderboard" tab');
bullet('Add a new row: Person Name | Points (800-1200) | Reason | Date (DD/MM/YYYY)');
bullet('The dashboard automatically reads this sheet and adds to the score');

// ══════════════════════════════════════════════════════════════════════════════
// 8. FILTERS & PERIODS
// ══════════════════════════════════════════════════════════════════════════════
sectionTitle('8.  Leaderboard Filters & Time Periods');
bodyText('The leaderboard has three time filters. All scores are recalculated independently per filter:');
doc.moveDown(0.3);

const FW = [110, 130, 255];
let fy = doc.y;
fy = tableRow(['Filter', 'Period', 'Use Case'], FW, fy, true, DARK);
[
  ['This Week',   'Monday to today',         'Weekly team check-in, short-term goals'],
  ['This Month',  '1st to today (default)',  'Monthly performance review — DEFAULT view'],
  ['All Time',    'June 2026 onwards',       'Overall leaderboard since launch'],
].forEach((row, i) => {
  fy = tableRow(row, FW, fy, false, i % 2 === 0 ? '#f9f9f9' : '#fff');
});

doc.moveDown(0.8);
bodyText('The leaderboard refreshes every 12 hours automatically or instantly when the Refresh button is clicked. The leaderboard data cache is separate from the main task data (which refreshes every 160 seconds).');

// ══════════════════════════════════════════════════════════════════════════════
// 9. DASHBOARD WIDGET
// ══════════════════════════════════════════════════════════════════════════════
sectionTitle('9.  Dashboard Widget');
bodyText('A mini leaderboard widget appears on the Dashboard tab for Admin and Higher Management. It shows:');
bullet('Top Performer — large hero card with photo, name, and total points');
bullet('Filter tabs: This Week | This Month | All Time');
bullet('"Full view" link — navigates directly to the Leaderboard tab');
doc.moveDown(0.3);
bodyText('The widget uses a separate 12-hour cache to avoid excessive API calls to Google Sheets.');

doc.addPage();

// ══════════════════════════════════════════════════════════════════════════════
// 10. RULES & FAIR PLAY
// ══════════════════════════════════════════════════════════════════════════════
sectionTitle('10.  Rules & Fair Play');

const rules = [
  ['Data Source',       'All points come directly from the Google Sheet. No manual editing of scores except via the "Objectives Completed" (Leaderboard sheet tab).'],
  ['Start Date',        'Leaderboard only includes data from June 1, 2026 onwards. Earlier data is excluded.'],
  ['Testers',           'Team members with a testing role (e.g. Vinay) have separate scoring rules and are excluded from the main leaderboard until a custom strategy is defined.'],
  ['Time Estimation',   'Points for Task Closed and PM Approved are based on the Time Estimation value in the sheet. Empty or 0-hour tasks default to the < 1 hour bracket (10 pts).'],
  ['Status = One Value','Task Status and PM Status each hold one value at a time. A task earns either "Submitted To PM" points OR "Task Closed" points — never both.'],
  ['Visibility',        'The full leaderboard is visible only to Admin, Higher Management, and Mod. Other roles cannot access it.'],
  ['Refresh',           'Click Refresh on the leaderboard page to get the latest data immediately.'],
];

rules.forEach(([title, desc]) => {
  subTitle(title);
  bodyText(desc);
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. FUTURE PLANS
// ══════════════════════════════════════════════════════════════════════════════
sectionTitle('11.  Future Plans');
bodyText('The following enhancements are planned for future leaderboard updates:');
bullet('Custom scoring strategy for testers (QA role)');
bullet('"Top Performer So Far" monthly archive — auto-populates after each month ends');
bullet('Feedback system — PM-to-resource feedback tied to task performance');
bullet('Team-level leaderboard (by role or project)');
bullet('Streak bonuses — consecutive weeks of top performance');

doc.moveDown(1);
doc.rect(50, doc.y, 495, 2).fill(ORANGE);
doc.moveDown(0.5);
doc.fillColor(MUTED).font('Helvetica').fontSize(9)
   .text('This document was generated automatically from the Cybernext Dashboard system.', { align: 'center' })
   .text(`Cybernext © ${new Date().getFullYear()} — Confidential`, { align: 'center' });

// ══════════════════════════════════════════════════════════════════════════════
doc.end();
console.log('PDF generated:', outPath);
