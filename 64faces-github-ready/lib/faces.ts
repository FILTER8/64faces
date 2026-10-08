// All artwork and metadata are read from the deployed Robinhood Chain contract.
// No NFT images, traits, or rarity values are invented or stored off-chain here.

import { BLACK, CONTRACT, GREEN, type Face } from "./shared";

const RPC = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const TOTAL_SUPPLY_SELECTOR = "0x18160ddd";
const TOKEN_URI_SELECTOR = "0xc87b56dd";



type CacheEntry = { face: Face; at: number };
const faceCache = new Map<number, CacheEntry>();
const pending = new Map<number, Promise<Face>>();
const TTL = 10 * 60 * 1000;

async function ethCall(data: string): Promise<string> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: CONTRACT, data }, "latest"] }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Robinhood RPC returned ${res.status}`);
  const payload: { result?: string; error?: { message?: string } } = await res.json();
  if (payload.error || !payload.result || payload.result === "0x") {
    throw new Error(payload.error?.message || "Empty contract response");
  }
  return payload.result;
}

function decodeAbiString(hex: string): string {
  const data = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (data.length < 128) throw new Error("Invalid ABI string response");
  const offset = Number(BigInt("0x" + data.slice(0, 64))) * 2;
  const size = Number(BigInt("0x" + data.slice(offset, offset + 64)));
  if (!Number.isSafeInteger(size) || size < 0 || size > 2000000) throw new Error("Invalid ABI string length");
  const raw = data.slice(offset + 64, offset + 64 + size * 2);
  if (raw.length !== size * 2) throw new Error("Truncated contract string");
  return Buffer.from(raw, "hex").toString("utf8");
}

function decodeDataUri(uri: string): string {
  const comma = uri.indexOf(",");
  if (!uri.startsWith("data:") || comma < 0) throw new Error("Unexpected metadata URI");
  const header = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  return header.includes(";base64")
    ? Buffer.from(payload, "base64").toString("utf8")
    : decodeURIComponent(payload);
}

function svgToRows(svg: string): { rows: number[]; background: string; foreground: string } {
  const background = /background-color:\s*(#[0-9a-fA-F]{6})/i.exec(svg)?.[1]?.toUpperCase();
  const foreground = /<g\s+fill=["'](#[0-9a-fA-F]{6})["']/i.exec(svg)?.[1]?.toUpperCase();
  if (!background || !foreground || ![GREEN, BLACK].includes(background) || ![GREEN, BLACK].includes(foreground)) {
    throw new Error("Unexpected on-chain palette");
  }
  const rows = Array<number>(8).fill(0);
  const regex = /<rect\s+x=["']([0-7])["']\s+y=["']([0-7])["']\s+width=["']1["']\s+height=["']1["']\s*\/>/g;
  for (const match of svg.matchAll(regex)) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    rows[y] |= 1 << (7 - x);
  }
  return { rows, background, foreground };
}

export async function getTotalSupply(): Promise<number> {
  const result = await ethCall(TOTAL_SUPPLY_SELECTOR);
  const supply = Number(BigInt(result));
  if (!Number.isSafeInteger(supply) || supply < 0 || supply > 512) {
    throw new Error("Unexpected 64 Faces total supply");
  }
  return supply;
}

async function loadFace(id: number): Promise<Face> {
  const encodedId = BigInt(id).toString(16).padStart(64, "0");
  const tokenURI = decodeAbiString(await ethCall(TOKEN_URI_SELECTOR + encodedId));
  const metadata = JSON.parse(decodeDataUri(tokenURI)) as {
    image?: string;
    attributes?: { trait_type?: string; value?: string | number }[];
  };
  if (!metadata.image) throw new Error("No artwork in token metadata");
  const pixelData = svgToRows(decodeDataUri(metadata.image));
  const traits: Record<string, string> = {};
  for (const trait of metadata.attributes || []) {
    if (trait.trait_type && trait.value !== undefined) traits[trait.trait_type] = String(trait.value);
  }
  return { id, ...pixelData, traits };
}

export async function getFace(id: number): Promise<Face> {
  if (!Number.isSafeInteger(id) || id < 0 || id > 512) throw new Error("Invalid token ID");
  const existing = faceCache.get(id);
  if (existing && Date.now() - existing.at < TTL) return existing.face;
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;
  const request = loadFace(id).then((face) => {
    faceCache.set(id, { face, at: Date.now() });
    return face;
  }).finally(() => pending.delete(id));
  pending.set(id, request);
  return request;
}

let cachedFirst: number | undefined;
export async function getFirstTokenId(supply: number): Promise<number> {
  if (!supply) return 1;
  if (cachedFirst !== undefined) return cachedFirst;
  try {
    await getFace(0);
    cachedFirst = 0;
  } catch {
    cachedFirst = 1;
  }
  return cachedFirst;
}

export function isValidTokenId(value: string): boolean {
  return /^(0|[1-9][0-9]{0,3})$/.test(value) && Number(value) <= 512;
}
