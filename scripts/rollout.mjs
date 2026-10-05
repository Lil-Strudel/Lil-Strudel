import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [login = "Lil-Strudel", out = "dist/rollout.svg"] = process.argv.slice(2);

const W = 1200;
const H = 316;
const LEFT = 48;
const RIGHT = 1152;
const TOP = 96;
const LOOP = 10;
const SWEEP = 0.7;

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date weekday contributionLevel } }
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

const levels = {
  NONE: "l0",
  FIRST_QUARTILE: "l1",
  SECOND_QUARTILE: "l2",
  THIRD_QUARTILE: "l3",
  FOURTH_QUARTILE: "l4",
};

function render({ totalContributions, weeks }) {
  // Odd rows sit half a pitch to the right, so the grid needs room for half an extra column.
  const pitch = (RIGHT - LEFT) / (weeks.length + 0.5);
  const radius = pitch / Math.sqrt(3);
  const rowPitch = radius * 1.5;
  const hex = [...Array(6)]
    .map((_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return `${round(radius * 0.84 * Math.cos(a))} ${round(radius * 0.84 * Math.sin(a))}`;
    })
    .join("L");
  const bottom = TOP + rowPitch * 6 + radius;
  const sweep = LOOP * SWEEP;

  const columns = weeks.map((week, i) => {
    const x = LEFT + pitch * (i + 0.5);
    const delay = round(((x - LEFT) / (RIGHT - LEFT)) * sweep * 100) / 100;
    const pods = week.contributionDays.map((day) => {
      const px = round(x + (day.weekday % 2) * (pitch / 2));
      const py = round(TOP + day.weekday * rowPitch);
      return `<use xlink:href="#pod" x="${px}" y="${py}" class="${levels[day.contributionLevel]}"/>`;
    });
    return `<g class="col" style="animation-delay:${delay}s">${pods.join("")}</g>`;
  });

  const months = [];
  weeks.forEach((w, i) => {
    const date = new Date(w.contributionDays[0].date);
    const x = round(LEFT + pitch * (i + 0.5));
    if (i && date.getUTCMonth() !== new Date(weeks[i - 1].contributionDays[0].date).getUTCMonth() && x - (months.at(-1)?.x ?? 0) > 48) {
      months.push({ x, label: date.toLocaleString("en", { month: "short", timeZone: "UTC" }) });
    }
  });

  const pct = (n) => `${round(n * 100)}%`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="MonoLisa, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace" role="img" aria-label="${login}'s last year of GitHub contributions drawn as a Kubernetes rollout, one pod per day: ${totalContributions} contributions">
<style>
.l0{fill:#1d1c19;stroke:#282727;stroke-width:1.5}
.l1{fill:#8ba4b0;fill-opacity:.3}
.l2{fill:#8ba4b0;fill-opacity:.55}
.l3{fill:#8ba4b0;fill-opacity:.8}
.l4{fill:#8ba4b0}
.col{animation:roll ${LOOP}s ease-out infinite both}
.scan{opacity:0;animation:scan ${LOOP}s linear infinite}
.wait{opacity:0;animation:wait ${LOOP}s steps(1) infinite}
.done{animation:done ${LOOP}s steps(1) infinite}
@keyframes roll{0%{opacity:1}1.5%{opacity:.12}7%,100%{opacity:1}}
@keyframes scan{0%{opacity:1;transform:translateX(0)}${pct(SWEEP)}{opacity:1;transform:translateX(${RIGHT - LEFT}px)}${pct(SWEEP + 0.01)},100%{opacity:0;transform:translateX(${RIGHT - LEFT}px)}}
@keyframes wait{0%{opacity:1}${pct(SWEEP)},100%{opacity:0}}
@keyframes done{0%{opacity:0}${pct(SWEEP)},100%{opacity:1}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs>
<clipPath id="card"><rect width="${W}" height="${H}" rx="16"/></clipPath>
<radialGradient id="wall" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#2a2421"/><stop offset=".55" stop-color="#1d1c19"/><stop offset="1" stop-color="#0d0c0c"/></radialGradient>
<linearGradient id="beam" x1="0" x2="1"><stop offset="0" stop-color="#c4b28a" stop-opacity="0"/><stop offset="1" stop-color="#c4b28a" stop-opacity=".5"/></linearGradient>
<path id="pod" d="M${hex}Z"/>
</defs>
<g clip-path="url(#card)">
<rect width="${W}" height="${H}" fill="url(#wall)"/>
<text x="${LEFT}" y="52" font-size="18" xml:space="preserve"><tspan fill="#8ea4a2" font-weight="bold">~</tspan><tspan fill="#87a987"> ❯ </tspan><tspan fill="#c5c9c5">kubectl rollout status deploy/contributions</tspan></text>
<text x="${RIGHT}" y="52" font-size="18" text-anchor="end" fill="#7a8382"><tspan fill="#c4b28a" font-weight="bold">${totalContributions.toLocaleString("en")}</tspan> contributions · 52w</text>
${columns.join("\n")}
<rect class="scan" x="${LEFT - 40}" y="${TOP - radius - 6}" width="40" height="${round(bottom - TOP + radius + 12)}" fill="url(#beam)"/>
${months.map((m) => `<text x="${m.x}" y="${round(bottom + 28)}" font-size="15" text-anchor="middle" fill="#7a8382">${m.label}</text>`).join("\n")}
<g font-size="16">
<text class="wait" x="${LEFT}" y="${H - 24}" fill="#a6a69c">Waiting for deployment "contributions" rollout to finish…</text>
<text class="done" x="${LEFT}" y="${H - 24}" fill="#87a987">deployment "contributions" successfully rolled out</text>
</g>
</g>
</svg>
`;
}

const svg = render(await fetchCalendar());
await mkdir(dirname(out), { recursive: true });
await writeFile(out, svg);
