
export const CONTRACT =
  "0xc8e36ae47246e5943da2b228fbaff1fb27a473b0" as const;

export const CHAIN_ID = 4663;

export const GREEN = "#CCFF00";
export const BLACK = "#000000";

export const TRAIT_NAMES = [
  "Palette",
  "Head Shape",
  "Hair / Headwear",
  "Eyes",
  "Eyebrows",
  "Expression",
  "Accessory",
] as const;

// Shared face data used by the gallery and API.
// The artwork is loaded directly from Robinhood Chain.
export type Face = {
  id: number;
  rows: number[];
  background: string;
  foreground: string;
  traits: Record<string, string>;
};
