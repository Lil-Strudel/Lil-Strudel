import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [login = "Lil-Strudel", out = "dist/ultra.svg"] = process.argv.slice(2);

const W = 1200;
const H = 300;
const LEFT = 48;
const RIGHT = 1152;
const TOP = 104;
const BASE = 244;
const LOOP = 16;
const RUNNING = 0.85;

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

async function fetchCalendar() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": login,
    },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const { data, errors } = await res.json();
  if (errors || !data?.user) throw new Error(JSON.stringify(errors ?? data));
  return data.user.contributionsCollection.contributionCalendar;
}

const round = (n) => Math.round(n * 10) / 10;
const clamp = (n) => Math.min(BASE, Math.max(TOP - 8, n));

// Catmull-Rom through the weekly points; clamping the control points keeps
// the curve inside the plot, since a cubic never leaves its control hull.
function ridge(points) {
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [points[i - 1] ?? points[i], points[i], points[i + 1], points[i + 2] ?? points[i + 1]];
    const c1 = [round(p1.x + (p2.x - p0.x) / 6), round(clamp(p1.y + (p2.y - p0.y) / 6))];
    const c2 = [round(p2.x - (p3.x - p1.x) / 6), round(clamp(p2.y - (p3.y - p1.y) / 6))];
    d += `C${c1} ${c2} ${p2.x} ${p2.y}`;
  }
  return d;
}

function render({ totalContributions, weeks }) {
  const totals = weeks.map((w) => w.contributionDays.reduce((sum, d) => sum + d.contributionCount, 0));
  const max = Math.max(1, ...totals);
  const step = (RIGHT - LEFT) / (totals.length - 1);
  // A square-root-ish scale so one huge week doesn't flatten the rest of the year.
  const points = totals.map((count, i) => ({
    x: round(LEFT + i * step),
    y: round(BASE - (BASE - TOP) * (count / max) ** 0.6),
  }));
  const path = ridge(points);

  const months = [];
  weeks.forEach((w, i) => {
    const date = new Date(w.contributionDays[0].date);
    const prev = i && new Date(weeks[i - 1].contributionDays[0].date);
    if (i && date.getUTCMonth() !== prev.getUTCMonth() && points[i].x - (months.at(-1)?.x ?? 0) > 48) {
      months.push({ x: points[i].x, label: date.toLocaleString("en", { month: "short", timeZone: "UTC" }) });
    }
  });

  const peak = totals.indexOf(max);
  const summit = points[peak];
  const anchor = summit.x < LEFT + 80 ? "start" : summit.x > RIGHT - 80 ? "end" : "middle";
  const finish = points.at(-1);
  const keys = `keyPoints="0;1;1" keyTimes="0;${RUNNING};1" calcMode="linear" dur="${LOOP}s" repeatCount="indefinite"`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="MonoLisa, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace" role="img" aria-label="${login}'s last year of GitHub contributions drawn as an ultramarathon elevation profile: ${totalContributions} contributions, peak week ${max}">
<defs>
<clipPath id="card"><rect width="${W}" height="${H}" rx="16"/></clipPath>
<radialGradient id="wall" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#2a2421"/><stop offset=".55" stop-color="#1d1c19"/><stop offset="1" stop-color="#0d0c0c"/></radialGradient>
<linearGradient id="slope" x1="0" y1="${TOP}" x2="0" y2="${BASE}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8ba4b0" stop-opacity=".32"/><stop offset="1" stop-color="#8ba4b0" stop-opacity="0"/></linearGradient>
</defs>
<g clip-path="url(#card)">
<rect width="${W}" height="${H}" fill="url(#wall)"/>
<text x="${LEFT}" y="52" font-size="18" xml:space="preserve"><tspan fill="#8ea4a2" font-weight="bold">~</tspan><tspan fill="#87a987"> ❯ </tspan><tspan fill="#c5c9c5">ultra --last 52w</tspan></text>
<text x="${RIGHT}" y="52" font-size="18" text-anchor="end" fill="#7a8382"><tspan fill="#c4b28a" font-weight="bold">${totalContributions.toLocaleString("en")}</tspan> contributions climbed</text>
<path d="${path}L${RIGHT} ${BASE}L${LEFT} ${BASE}Z" fill="url(#slope)"/>
<line x1="${LEFT}" y1="${BASE}" x2="${RIGHT}" y2="${BASE}" stroke="#282727" stroke-width="2"/>
${months.map((m) => `<line x1="${m.x}" y1="${BASE}" x2="${m.x}" y2="${BASE + 6}" stroke="#625e5a" stroke-width="2"/><text x="${m.x}" y="${BASE + 26}" font-size="15" text-anchor="middle" fill="#7a8382">${m.label}</text>`).join("\n")}
<path id="ridge" d="${path}" fill="none" stroke="#8ba4b0" stroke-opacity=".55" stroke-width="2.5" stroke-linejoin="round"/>
<path d="${path}" pathLength="1" fill="none" stroke="#c4b28a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 1" stroke-dashoffset="0">
<animate attributeName="stroke-dashoffset" values="1;0;0" keyTimes="0;${RUNNING};1" dur="${LOOP}s" repeatCount="indefinite"/>
</path>
<path d="M${summit.x - 6} ${summit.y - 10}L${summit.x + 6} ${summit.y - 10}L${summit.x} ${summit.y - 18}Z" fill="#a292a3"/>
<text x="${summit.x}" y="${summit.y - 26}" font-size="15" text-anchor="${anchor}" fill="#a292a3">peak · ${max}/wk</text>
<g stroke="#c5c9c5" stroke-width="2"><line x1="${finish.x}" y1="${finish.y}" x2="${finish.x}" y2="${finish.y - 34}"/></g>
<g transform="translate(${finish.x} ${finish.y - 34})"><rect width="24" height="16" fill="#c5c9c5"/><path d="M0 0h6v4h-6zM12 0h6v4h-6zM6 4h6v4h-6zM18 4h6v4h-6zM0 8h6v4h-6zM12 8h6v4h-6zM6 12h6v4h-6zM18 12h6v4h-6z" fill="#181616"/></g>
<g>
<animateMotion ${keys}><mpath xlink:href="#ridge"/></animateMotion>
<circle r="11" fill="#c4b28a" fill-opacity=".25"><animate attributeName="r" values="7;14;7" dur="1.2s" repeatCount="indefinite"/></circle>
<circle r="5.5" fill="#c4b28a" stroke="#181616" stroke-width="2"/>
</g>
</g>
</svg>
`;
}

const svg = render(await fetchCalendar());
await mkdir(dirname(out), { recursive: true });
await writeFile(out, svg);
