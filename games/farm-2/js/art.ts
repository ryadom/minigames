import { CROPS, type CropId, type Plot, ready, type Tool } from "./model";

const svg = (body: string, box = "0 0 64 64"): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" aria-hidden="true">${body}</svg>`;

const leaves = `<path d="M32 49V23" stroke="#47733a" stroke-width="4" stroke-linecap="round"/><path d="M31 36Q8 35 16 21Q31 19 32 36M33 29Q52 30 50 15Q33 13 33 29" fill="#629d49"/>`;

export function toolArt(tool: Tool): string {
  const paths = {
    plant:
      '<path d="M12 21V10M12 15C3 16 3 7 3 7s9-1 9 8ZM12 11C12 3 21 3 21 3s0 8-9 8ZM7 21h10"/>',
    water:
      '<path d="M5 11h10v9H5zM7 11V8h6v3M15 12l5-4 2 2-7 8M5 12H3a3 3 0 000 6h2M21 15v1M23 18v1"/>',
    harvest: '<path d="M3 10h18l-3 11H6ZM7 10l5-8 5 8M9 14v4M15 14v4"/>',
  };
  return svg(
    `<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[tool]}</g>`,
    "0 0 24 24",
  );
}
export function cropArt(id: CropId | "egg"): string {
  let body = "";
  if (id === "wheat") {
    body = `<path d="M22 57L27 19M39 56L36 10M31 57L45 24" stroke="#9a762f" stroke-width="3" stroke-linecap="round"/>`;
    for (const [x, y] of [
      [26, 22],
      [25, 32],
      [35, 12],
      [36, 23],
      [37, 33],
      [44, 26],
      [41, 36],
    ]) {
      body += `<ellipse cx="${x - 4}" cy="${y}" rx="4" ry="7" transform="rotate(-35 ${x - 4} ${y})" fill="#e9b94d"/><ellipse cx="${x + 4}" cy="${y - 2}" rx="4" ry="7" transform="rotate(35 ${x + 4} ${y - 2})" fill="#f5cf6c"/>`;
    }
  } else if (id === "carrot") {
    body = `<path d="M29 25Q9 16 16 7Q28 9 32 26M34 25Q35 4 44 7Q51 17 34 25M31 23Q25 2 33 2Q43 6 31 23" fill="#609849"/><path d="M22 25Q32 18 44 27L29 60Q25 62 23 55Z" fill="#ea873d"/><path d="M33 25Q42 24 42 29L29 57Z" fill="#f5a350"/><path d="M23 33L31 35M30 44L36 45" stroke="#c7692e" stroke-width="2"/>`;
  } else if (id === "potato") {
    body = `${leaves}<ellipse cx="25" cy="44" rx="16" ry="12" transform="rotate(-25 25 44)" fill="#bf965f"/><ellipse cx="43" cy="45" rx="13" ry="11" fill="#dab581"/><g fill="#a78252"><circle cx="20" cy="40" r="2"/><circle cx="30" cy="48" r="2"/><circle cx="42" cy="42" r="2"/><circle cx="48" cy="49" r="1.5"/></g>`;
  } else if (id === "tomato") {
    body = `${leaves}<circle cx="22" cy="43" r="13" fill="#d55b46"/><circle cx="44" cy="42" r="13" fill="#ed7253"/><path d="M15 30L22 34L30 29L25 38L18 37ZM36 29L44 33L51 28L48 37L41 37Z" fill="#47733a"/><circle cx="47" cy="41" r="3" fill="#f7a383"/>`;
  } else if (id === "strawberry") {
    body = `${leaves}<path d="M14 31Q27 24 34 37Q33 49 24 58Q11 50 10 40Q9 34 14 31M37 30Q51 26 55 38Q53 49 44 54Q32 47 33 37Z" fill="#d96362"/><path d="M12 30L23 33L28 27L27 36L17 37ZM36 30L44 33L51 28L47 37L39 36Z" fill="#528046"/><g fill="#ffe0a0"><ellipse cx="16" cy="41" rx="1" ry="2"/><ellipse cx="25" cy="42" rx="1" ry="2"/><ellipse cx="22" cy="50" rx="1" ry="2"/><ellipse cx="40" cy="40" rx="1" ry="2"/><ellipse cx="48" cy="41" rx="1" ry="2"/><ellipse cx="44" cy="48" rx="1" ry="2"/></g>`;
  } else if (id === "pumpkin") {
    body = `<path d="M32 23Q27 9 39 10" fill="none" stroke="#64814b" stroke-width="5" stroke-linecap="round"/><path d="M33 21Q46 2 56 18Q48 29 33 21" fill="#779e53"/><ellipse cx="23" cy="41" rx="15" ry="18" fill="#d48038"/><ellipse cx="43" cy="41" rx="15" ry="18" fill="#dc8e3f"/><ellipse cx="33" cy="41" rx="13" ry="20" fill="#eea24d"/><path d="M33 24Q27 41 33 59" fill="none" stroke="#f4b76b" stroke-width="3"/>`;
  } else {
    body = `<path d="M17 38C17 19 28 7 33 7S50 24 50 39C50 60 17 61 17 38" fill="#f3e5bf"/><path d="M23 35Q23 23 30 19" fill="none" stroke="#fff8df" stroke-width="5" stroke-linecap="round"/>`;
  }
  return svg(body).replace("<svg ", '<svg width="64" height="64" ');
}

export function plotArt(plot: Plot | undefined): string {
  if (!plot) {
    return svg(
      `<path d="M60 49L116 77L60 105L4 77Z" fill="#97b879" fill-opacity=".22" stroke="#82a666" stroke-dasharray="5 5"/><path d="M54 76V71a6 6 0 0112 0v5M53 76h14v12H53Z" fill="none" stroke="#749661" stroke-width="2"/>`,
      "0 0 120 112",
    );
  }
  const wet = plot.watered;
  let body = `<path d="M4 75L60 103L116 75V83L60 111L4 83Z" fill="#755140"/><path d="M60 47L116 75L60 103L4 75Z" fill="${wet ? "#79583f" : "#a67b50"}" stroke="#be9464" stroke-width="2"/>`;
  for (let i = 0; i < 4; i++) {
    body += `<path d="M${17 + i * 12} ${71 - i * 6}l43 22" stroke="${wet ? "#644b3a" : "#8c623f"}" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (plot.crop) {
    const grown = ready(plot);
    if (grown) {
      body += `<g transform="translate(13 8) scale(.72)">${cropArt(plot.crop)}</g><g transform="translate(46 25) scale(.65)">${cropArt(plot.crop)}</g>`;
    } else {
      const scale = 0.4 + (plot.growth / CROPS[plot.crop].days) * 0.35;
      for (const [x, y] of [
        [39, 62],
        [62, 74],
        [81, 62],
      ]) {
        body += `<g transform="translate(${x - 32 * scale} ${y - 50 * scale}) scale(${scale})">${leaves}</g>`;
      }
    }
    if (wet && !grown) body += `<path d="M94 82q-7-7 0-15q7 8 0 15" fill="#97cbd2"/>`;
  } else
    body += `<path d="M56 74h8m-4-4v8" stroke="#e0c198" stroke-width="2" stroke-linecap="round"/>`;
  return svg(body, "0 0 120 112");
}

function tree(x: number, y: number, scale = 1): string {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cy="5" rx="32" ry="14" fill="#708e5c" opacity=".2"/><path d="M-5 4v-55h11V4" fill="#94714e"/><path d="M-28-26Q-47-36-29-55Q-38-73-15-80Q1-102 19-81Q47-78 35-51Q51-29 23-19Z" fill="#648b50"/><path d="M-25-48Q-40-66-15-78Q1-96 18-78Q43-75 30-56Q13-61 4-39Z" fill="#7d9f61"/><path d="M-15-77Q2-94 17-78Q5-80 2-67Z" fill="#93b173"/></g>`;
}
function fence(x: number, y: number, count: number): string {
  let body = "";
  for (let i = 0; i < count; i++) {
    const px = x + i * 29;
    const py = y + i * 14.5;
    body += `<path d="M${px} ${py - 22}l29 14.5m-29-4l29 14.5" stroke="#e0c9a0" stroke-width="5"/><path d="M${px} ${py - 29}v35" stroke="#aa8c65" stroke-width="6"/>`;
  }
  return body;
}
export function scenery(): string {
  return svg(
    `<defs><pattern id="grass" width="53" height="43" patternUnits="userSpaceOnUse"><path d="M8 17l2-4m3 6l2-4M35 35l2-4" stroke="#719653" stroke-opacity=".22" stroke-width="2"/><circle cx="41" cy="9" r="1.5" fill="#e3d5a4"/></pattern></defs>
    <path d="M0 0H1000V650H0Z" fill="#b6cc91"/>
    <path d="M0 55Q170 3 350 54T690 40T1000 27V0H0Z" fill="#a9c084"/>
    <path d="M0 0H1000V650H0Z" fill="url(#grass)"/>
    <path d="M-30 375Q119 361 178 407T319 505T571 553T811 558L1040 690" fill="none" stroke="#d6bd90" stroke-width="63"/>
    <path d="M-30 373Q119 359 178 405T319 503T571 551T811 556L1040 688" fill="none" stroke="#e7d2a9" stroke-width="48"/>
    <path d="M747 398Q779 354 847 359Q932 355 955 418Q970 470 916 489Q856 517 818 485Q763 472 747 398" fill="#9caf7b"/>
    <path d="M759 400Q794 365 849 371Q918 365 941 418Q960 457 908 478Q860 500 824 473Q770 462 759 400" fill="#7fadb0"/>
    <path d="M780 396Q826 380 865 385M836 463q33 14 65-2M872 421h37M786 430h29" fill="none" stroke="#b8d6c6" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="885" cy="448" rx="12" ry="6" fill="#6f9666"/><path d="M886 445l4-7l4 7" fill="#f4d8c0"/>
    <path d="M171 250L233 220L308 257L245 289Z" fill="#6f8c5a" opacity=".2"/>
    <path d="M183 190L241 216V284L183 255Z" fill="#b96753"/><path d="M241 216L308 184V252L241 284Z" fill="#a45344"/>
    <path d="M175 192L226 126L250 209Z" fill="#e2b989"/><path d="M226 126L293 96L323 180L250 215Z" fill="#58674f"/><path d="M232 133L288 108L312 176L255 201Z" fill="#65735b"/>
    <path d="M260 230L287 217V262L260 275Z" fill="#6b5444"/><path d="M261 231L286 260M286 219L261 273" stroke="#d4ae83" stroke-width="3"/>
    <path d="M197 213L215 222V240L197 231Z" fill="#e8cf9b"/><path d="M197 222L215 231M206 218V235" stroke="#95734d" stroke-width="2"/>
    <path d="M202 169L215 153L224 179Z" fill="#705b46"/>
    ${fence(332, 159, 9)}
    <g transform="translate(748 172)"><ellipse cy="8" rx="36" ry="15" fill="#78915c" opacity=".25"/><path d="M-22 0L-13-70H16L27 0L2 14Z" fill="#ede0bb"/><path d="M-20-70L1-100L24-69Z" fill="#899276"/><path d="M1-73V8" stroke="#d3c39f" stroke-width="3"/><path d="M-6-14H10V9H-6Z" fill="#8a7c60"/><g class="windmill-sails"><path d="M0-66L-32-106M0-66L40-98M0-66L32-26M0-66L-40-34" stroke="#806e50" stroke-width="4"/><path d="M-8-78L-31-104L-40-94L-17-68M12-74L38-97L48-87L22-64M8-54L31-28L41-38L18-64M-12-58L-38-35L-48-45L-22-68" fill="#f4eaca" stroke="#b9a783" stroke-width="2"/></g></g>
    ${tree(91, 244, 1.25)}${tree(125, 160, 1.05)}${tree(45, 140, 1.3)}${tree(342, 114, 0.85)}${tree(916, 234, 1.35)}${tree(980, 308, 1.1)}${tree(845, 152, 0.9)}${tree(73, 550, 1.3)}${tree(150, 596, 1.15)}${tree(248, 627, 0.9)}
    ${fence(495, 552, 7)}
    <g fill="#eee5bd"><circle cx="152" cy="304" r="4"/><circle cx="160" cy="311" r="4"/><circle cx="684" cy="475" r="4"/><circle cx="696" cy="478" r="3"/><circle cx="864" cy="547" r="4"/></g>
    <g fill="#d1a591"><circle cx="113" cy="450" r="4"/><circle cx="123" cy="456" r="3"/><circle cx="815" cy="292" r="4"/></g>
    <g transform="translate(319 377)"><path d="M0 0V-29M-14-27H17V-10H-14Z" fill="#9d815b" stroke="#9d815b" stroke-width="4"/><path d="M-6-20H9M4-24L10-20L4-16" fill="none" stroke="#f4e6c3" stroke-width="2"/></g>
    <g transform="translate(664 576)"><ellipse rx="12" ry="7" fill="#9c9e77"/><ellipse cx="20" cy="7" rx="9" ry="5" fill="#abac87"/></g>`,
    "0 0 1000 650",
  );
}
