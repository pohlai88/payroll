/**
 * @feature shell
 * @layer script
 *
 * Contrast audit for the SPA theme tokens.
 *
 * Parses the real `:root` / `.dark` blocks out of src/web/shadcn.css — not a
 * copy of them — so the palette cannot drift away from its own guarantees.
 * Checks WCAG 2.1 text (4.5:1) and non-text (3:1) contrast, including the
 * alpha-composited `bg-<token>/10` tints the Badge/Alert/Button status
 * variants actually paint, and reports perceptual separation between the
 * status inks under three dichromacies.
 *
 * Run: npm run audit:contrast
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CSS_PATH = fileURLToPath(
  new URL("../src/web/shadcn.css", import.meta.url)
);

/* ------------------------------------------------------------- colour math */

type Rgb = [number, number, number];

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const srgbToLin = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const linToSrgb = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

function oklchToLinearRgb(L: number, C: number, hDeg: number): Rgb {
  const rad = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (lin: Rgb): boolean =>
  lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** Reduce chroma until the colour fits sRGB, matching how browsers clamp. */
function oklchToRgb(L: number, C: number, h: number): Rgb {
  let chroma = C;
  if (!inGamut(oklchToLinearRgb(L, C, h))) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinearRgb(L, mid, h))) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    chroma = lo;
  }
  return oklchToLinearRgb(L, chroma, h).map((v) =>
    clamp01(linToSrgb(v))
  ) as Rgb;
}

const luminance = ([r, g, b]: Rgb): number =>
  0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const over = (fg: Rgb, alpha: number, backdrop: Rgb): Rgb => {
  const mix = (f: number, b: number): number => f * alpha + b * (1 - alpha);
  return [
    mix(fg[0], backdrop[0]),
    mix(fg[1], backdrop[1]),
    mix(fg[2], backdrop[2]),
  ];
};

const toHex = (rgb: Rgb): string =>
  `#${rgb
    .map((v) =>
      Math.round(clamp01(v) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;

/* Dichromat simulation, Viénot–Brettel–Mollon (1999), on linear RGB. */
const CVD_MATRIX: Record<string, number[][]> = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function simulate(rgb: Rgb, kind: string): Rgb {
  const lin = rgb.map(srgbToLin);
  const m = CVD_MATRIX[kind];
  if (m === undefined) {
    throw new Error(`unknown CVD matrix: ${kind}`);
  }
  return m.map((row) =>
    clamp01(
      linToSrgb(
        clamp01(row.reduce((s, k, i) => s + k * (lin[i] ?? 0), 0))
      )
    )
  ) as Rgb;
}

function toOklab([r, g, b]: Rgb): [number, number, number] {
  const lr = srgbToLin(r);
  const lg = srgbToLin(g);
  const lb = srgbToLin(b);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function deltaE(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/* ------------------------------------------------------------------ parsing */

type Theme = Map<string, { rgb: Rgb; alpha: number }>;

const OKLCH_RE =
  /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%\s*)?\)$/;

function parseBlock(css: string, selector: string): Theme {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`selector ${selector} not found in shadcn.css`);
  }
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  const theme: Theme = new Map();
  const declRe = /^\s*(--[a-z0-9-]+):\s*([^;]+);/gim;
  let match = declRe.exec(body);
  while (match !== null) {
    const [, name, rawValue] = match;
    if (name === undefined || rawValue === undefined) {
      match = declRe.exec(body);
      continue;
    }
    const value = rawValue.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const parsed = OKLCH_RE.exec(value);
    if (parsed) {
      const [, l, c, h, a] = parsed;
      if (l !== undefined && c !== undefined && h !== undefined) {
        theme.set(name, {
          rgb: oklchToRgb(Number(l), Number(c), Number(h)),
          alpha: a === undefined ? 1 : Number(a) / 100,
        });
      }
    }
    match = declRe.exec(body);
  }
  return theme;
}

/* ------------------------------------------------------------------- checks */

const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;
/** The bar a brand-constrained lightness ladder can hold across all vision
 *  models. Colour is never the only channel — status variants carry a glyph. */
const SEPARATION_MIN = 0.05;

const STATUS = ["success", "warning", "info", "destructive"] as const;

type Result = { ok: boolean; line: string };

function auditTheme(
  name: string,
  theme: Theme,
  tintAlphas: number[]
): Result[] {
  const results: Result[] = [];
  const get = (token: string): Rgb => {
    const entry = theme.get(`--${token}`);
    if (!entry) {
      throw new Error(`${name}: missing --${token}`);
    }
    return entry.rgb;
  };

  const check = (label: string, fg: Rgb, bg: Rgb, min: number): void => {
    const ratio = round2(contrast(fg, bg));
    results.push({
      ok: ratio >= min,
      line: `${ratio >= min ? "PASS" : "FAIL"}  ${String(ratio).padStart(6)} (min ${min})  ${name} ${label}`,
    });
  };

  const bg = get("background");
  const card = get("card");

  check("foreground / background", get("foreground"), bg, TEXT_MIN);
  check("card-foreground / card", get("card-foreground"), card, TEXT_MIN);
  check(
    "popover-fg / popover",
    get("popover-foreground"),
    get("popover"),
    TEXT_MIN
  );
  check(
    "muted-foreground / muted",
    get("muted-foreground"),
    get("muted"),
    TEXT_MIN
  );
  check("muted-foreground / background", get("muted-foreground"), bg, TEXT_MIN);
  check("muted-foreground / card", get("muted-foreground"), card, TEXT_MIN);
  check(
    "primary-fg / primary",
    get("primary-foreground"),
    get("primary"),
    TEXT_MIN
  );
  check(
    "secondary-fg / secondary",
    get("secondary-foreground"),
    get("secondary"),
    TEXT_MIN
  );
  check(
    "accent-fg / accent",
    get("accent-foreground"),
    get("accent"),
    TEXT_MIN
  );
  check(
    "sidebar-fg / sidebar",
    get("sidebar-foreground"),
    get("sidebar"),
    TEXT_MIN
  );
  check(
    "sidebar-primary-fg / sidebar-primary",
    get("sidebar-primary-foreground"),
    get("sidebar-primary"),
    TEXT_MIN
  );
  check("ring / background (focus)", get("ring"), bg, NON_TEXT_MIN);

  // An input's border is its only affordance; --border is decorative.
  const inputEntry = theme.get("--input");
  if (inputEntry) {
    const composited =
      inputEntry.alpha < 1
        ? over(inputEntry.rgb, inputEntry.alpha, card)
        : inputEntry.rgb;
    check("input boundary / card", composited, card, NON_TEXT_MIN);
  }

  // Status inks sit on their own composited tint, which is the hardest
  // backdrop they get — harder than the flat card.
  for (const token of STATUS) {
    const ink = get(token);
    check(`${token} / card`, ink, card, TEXT_MIN);
    check(`${token} / background`, ink, bg, TEXT_MIN);
    for (const alpha of tintAlphas) {
      const pct = Math.round(alpha * 100);
      check(
        `${token} / ${token}@${pct}% on card`,
        ink,
        over(ink, alpha, card),
        TEXT_MIN
      );
      check(
        `${token} / ${token}@${pct}% on bg`,
        ink,
        over(ink, alpha, bg),
        TEXT_MIN
      );
    }
  }

  for (let i = 1; i <= 5; i++) {
    check(`chart-${i} / background`, get(`chart-${i}`), bg, NON_TEXT_MIN);
  }

  // Perceptual separation, including under dichromatic vision.
  const groups: [string, string[], number][] = [
    ["status", [...STATUS], SEPARATION_MIN],
    ["charts", [1, 2, 3, 4, 5].map((i) => `chart-${i}`), SEPARATION_MIN],
  ];
  for (const [group, tokens, min] of groups) {
    for (const vision of [
      "normal",
      "deuteranopia",
      "protanopia",
      "tritanopia",
    ]) {
      const swatches = tokens.map((t) =>
        vision === "normal" ? get(t) : simulate(get(t), vision)
      );
      let worst = Number.POSITIVE_INFINITY;
      let pair = "";
      for (let i = 0; i < swatches.length; i++) {
        for (let j = i + 1; j < swatches.length; j++) {
          const left = swatches[i];
          const right = swatches[j];
          if (left === undefined || right === undefined) {
            continue;
          }
          const d = deltaE(left, right);
          if (d < worst) {
            worst = d;
            pair = `${tokens[i]}/${tokens[j]}`;
          }
        }
      }
      results.push({
        ok: worst >= min,
        line: `${worst >= min ? "PASS" : "WARN"}  ${worst.toFixed(3).padStart(6)} (min ${min})  ${name} ${group} ΔE ${vision} — closest ${pair}`,
      });
    }
  }

  return results;
}

/* --------------------------------------------------------------------- main */

const css = readFileSync(CSS_PATH, "utf8");
const lightTheme = parseBlock(css, ":root");
const darkTheme = parseBlock(css, ".dark");

const results = [
  ...auditTheme("light", lightTheme, [0.1, 0.2]),
  ...auditTheme("dark", darkTheme, [0.2, 0.3]),
];

const verbose = process.argv.includes("--verbose");
for (const r of results) {
  if (!r.ok || verbose) {
    process.stdout.write(`${r.line}\n`);
  }
}

/* Tritanopia cannot separate teal from amber at equal weight, and no
   single-brand palette fixes that — the glyph on each status variant is what
   carries the meaning (WCAG 1.4.1). Report it, do not fail the build on it. */
const hardFailures = results.filter((r) => !r.ok && r.line.startsWith("FAIL"));
const warnings = results.filter((r) => !r.ok && r.line.startsWith("WARN"));

process.stdout.write(
  `\n${results.length - hardFailures.length - warnings.length}/${results.length} checks pass` +
    `${warnings.length > 0 ? `, ${warnings.length} separation warning(s)` : ""}` +
    `${hardFailures.length > 0 ? `, ${hardFailures.length} FAILURE(S)` : ""}\n`
);

if (hardFailures.length > 0) {
  process.exit(1);
}

/* Quick reference for anyone tuning the palette by hand. */
if (verbose) {
  for (const [label, theme] of [
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const) {
    process.stdout.write(`\n${label}:\n`);
    for (const [token, { rgb }] of theme) {
      process.stdout.write(`  ${token.padEnd(30)} ${toHex(rgb)}\n`);
    }
  }
}
