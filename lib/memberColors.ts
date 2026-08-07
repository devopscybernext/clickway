// Deterministic per-person color — same name always gets same color across Team & Leaderboard
const MEMBER_PALETTE = [
  '#FE4A23', // orange-red
  '#16a34a', // green
  '#2563eb', // blue
  '#7c3aed', // violet
  '#dc2626', // red
  '#0891b2', // cyan
  '#d97706', // amber
  '#db2777', // pink
  '#059669', // emerald
  '#4f46e5', // indigo
];

export function memberColor(name: string): string {
  let hash = 0;
  const n = name.trim().toLowerCase();
  for (let i = 0; i < n.length; i++) hash = n.charCodeAt(i) + ((hash << 5) - hash);
  return MEMBER_PALETTE[Math.abs(hash) % MEMBER_PALETTE.length];
}

// Shared headshot lookup — used by Team gallery, leaderboard, and the top bar
const TEAM_PHOTOS: Record<string, string> = {
  akash: '/team/Akash.png', lovepreet: '/team/Lovepreet.png',
  manpreet: '/team/Manpreet.png', pawan: '/team/Pawan.png',
  robin: '/team/Robin.png', shubham: '/team/Shubham.png',
  vinay: '/team/Vinay.png', dhruv: '/team/Dhruv.png',
  kiran: '/team/Kiran.png', yash: '/team/Yash.png',
  muskan: '/team/Muskan.png', moon: '/team/Moon.png',
  sameer: '/team/Sameer.png',
  // Marketing — PPC
  atul: '/team/PPC/Atul.png', shiwangi: '/team/PPC/Shiwangi.png',
  dheeraj: '/team/PPC/Dheeraj.png', anjali: '/team/PPC/Anjali.png',
  anurag: '/team/PPC/Anurag.png', vansh: '/team/PPC/Vansh.png',
  // Marketing — SEO
  akshay: '/team/SEO/Akshay.png', bhavya: '/team/SEO/Bhavya.png',
  kshitij: '/team/SEO/Kshitij.png',
  // Marketing — SMM
  payal: '/team/SMM/Payal.png', akanksha: '/team/SMM/Akanksha.png',
};

export function memberPhoto(name: string): string {
  const lower = name.trim().toLowerCase();
  const key = Object.keys(TEAM_PHOTOS).find(k => lower.includes(k));
  return key ? TEAM_PHOTOS[key] : '';
}

// PPC + SEO log "Everyday" tasks as a monthly retainer hour block rather than
// a daily one, so they get Overload/Available thresholds instead of the
// daily-hour Occupied/Partially Occupied bands used by Web and SMM. The
// sheet's own Department column only distinguishes PPC/SMM (no SEO value),
// so this has to be a name-based roster instead.
export const MONTHLY_BLOCK_MARKETING_NAMES = new Set([
  'atul', 'shiwangi', 'dheeraj', 'anjali', 'anurag', 'vansh', // PPC
  'akshay', 'bhavya', 'kshitij', // SEO
]);
