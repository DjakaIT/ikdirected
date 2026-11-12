export type Kind = "wide" | "tall" | "square";

/** ARCHITECTURE §7.1: ar ≥ 1.3 wide, ≤ 0.85 tall, otherwise square. */
export function kindOf(width: number, height: number): Kind {
  const ar = width / height;
  if (ar >= 1.3) return "wide";
  if (ar <= 0.85) return "tall";
  return "square";
}

/** Class for a home-track item (ARCHITECTURE §7.2). Vertical offsets come from :nth-child in CSS. */
export function trackClass(width: number, height: number): `t-${Kind}` {
  return `t-${kindOf(width, height)}`;
}
