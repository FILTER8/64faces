"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Face } from "@/lib/shared";
import FaceProfile from "./FaceProfile";
import { BLACK, CONTRACT, GREEN, TRAIT_NAMES } from "@/lib/shared";
import { createPublicClient, createWalletClient, custom, http, parseAbi, type Address } from "viem";

type Batch = { faces: Face[]; totalSupply: number; firstTokenId: number; nextCursor: number | null; error?: string };
const OPENSEA = "https://opensea.io/collection/64-faces";
const BAZAAR = `https://www.netprotocol.app/app/bazaar/robinhood/${CONTRACT}`;
const ORIGINAL = "https://x.com/0xfilter8/status/2108099493740646415";
const EXPLORER = `https://robinhoodchain.blockscout.com/address/${CONTRACT}`;
const FILTER_ALL = "__all__";
const PAGE_SIZE = 24;
const mintChain = { id:4663, name:"Robinhood Chain", nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18}, rpcUrls:{default:{http:["https://rpc.mainnet.chain.robinhood.com"]}} } as const;
const mintClient = createPublicClient({chain: mintChain, transport: http(mintChain.rpcUrls.default.http[0])});
const mintAbi = parseAbi(["function mint(uint256 amount) payable", "function price() view returns (uint256)", "function maxSupply() view returns (uint256)", "function totalSupply() view returns (uint256)", "function maxMintsPerWallet() view returns (uint256)"]);
type InjectedWallet = {request(args:{method:string;params?:unknown[]}):Promise<unknown>};


function PixelFace({ face, className = "" }: { face: Face | null; className?: string }) {
  if (!face) return <div className={`pixel-art ${className}`} aria-label="Waiting for on-chain art" style={{ background: BLACK }} />;
  return (
    <div className={`pixel-art ${className}`} role="img" aria-label={`64 Faces token ${face.id}`} style={{ background: face.background }}>
      {face.rows.flatMap((row, y) =>
        Array.from({ length: 8 }, (_, x) => (
          <span key={`${y}-${x}`} className="pixel" style={{ background: row & (1 << (7 - x)) ? face.foreground : face.background }} />
        ))
      )}
    </div>
  );
}

type ExportMode = "art" | "card";

async function exportPNG(face: Face, mode: ExportMode, rank?: number) {
  // Draw directly from the contract bitmap to preserve crisp 8x8 pixels.
  const canvas = document.createElement("canvas");
  const size = 1024;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  // Both export formats use only the two collection colors.
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = GREEN;
  ctx.fillStyle = GREEN;
  ctx.lineWidth = 2;

  // Use the website font when ready; fall back to monospace without blocking export.
  try { await document.fonts.load('24px "Departure Mono"'); } catch { /* fallback */ }
  const mono = '"Departure Mono", monospace';
  const centerText = (label: string, y: number, fontSize: number) => {
    ctx.fillStyle = GREEN;
    ctx.font = `${fontSize}px ${mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, size / 2, y);
  };
  const leftText = (label: string, x: number, y: number, fontSize: number) => {
    ctx.fillStyle = GREEN;
    ctx.font = `${fontSize}px ${mono}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
  };
  const rightText = (label: string, x: number, y: number, fontSize: number) => {
    ctx.fillStyle = GREEN;
    ctx.font = `${fontSize}px ${mono}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
  };
  const drawFace = (x: number, y: number, edge: number) => {
    const pixel = edge / 8;
    ctx.fillStyle = face.background;
    ctx.fillRect(x, y, edge, edge);
    ctx.fillStyle = face.foreground;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (face.rows[row] & (1 << (7 - col))) {
          ctx.fillRect(x + col * pixel, y + row * pixel, pixel, pixel);
        }
      }
    }
  };

  if (mode === "art") {
    // Art + breathing room, with a simple 1-bit border and token ID.
    ctx.strokeRect(40, 40, 944, 944);
    drawFace(192, 128, 640);
    centerText(`64 FACES  #${face.id}`, 870, 30);
    centerText("FILTER8 / ROBINHOOD CHAIN", 924, 17);
  } else {
    // Full archival export with all seven trait names and values.
    ctx.strokeRect(40, 40, 944, 944);
    centerText("64 FACES", 100, 55);
    centerText(`ON-CHAIN FACE #${face.id}`, 158, 24);
    ctx.beginPath(); ctx.moveTo(80, 196); ctx.lineTo(944, 196); ctx.stroke();
    drawFace(312, 220, 400);
    ctx.beginPath(); ctx.moveTo(80, 647); ctx.lineTo(944, 647); ctx.stroke();

    const fontSize = 19;
    TRAIT_NAMES.forEach((name, index) => {
      const value = (face.traits[name] || "UNKNOWN").toUpperCase();
      const y = 674 + index * 36;
      leftText(name.toUpperCase(), 82, y, fontSize);
      rightText(value, 942, y, fontSize);
    });

    ctx.beginPath(); ctx.moveTo(80, 938); ctx.lineTo(944, 938); ctx.stroke();
    leftText("FILTER8", 82, 961, 20);
    rightText(rank ? `RARITY #${rank}` : "ROBINHOOD CHAIN", 942, 961, 17);
  }

  const link = document.createElement("a");
  link.download = `64faces-${face.id}-${mode === "card" ? "trait-card" : "framed"}.png`;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// Export the complete filtered gallery as one downloadable archival PNG.
// Uses the same ordered `matching` collection as the explorer (not the 48-item pagination).
async function exportGalleryPNG(
  gallery: Face[],
  filters: Record<string, string>,
  sort: string,
  search: string,
  ranks: Map<number, number>,
) {
  if (gallery.length === 0) return;

  await document.fonts.load('24px "Departure Mono"');

  const columns = Math.min(10, gallery.length);
  const rows = Math.ceil(gallery.length / columns);
  const margin = 112;
  const cell = 176;
  const gap = 16;
  const innerWidth = columns * cell + (columns - 1) * gap;
  const width = Math.max(1100, innerWidth + margin * 2);
  const activeTraits = TRAIT_NAMES
    .filter((name) => filters[name] && filters[name] !== FILTER_ALL)
    .map((name) => `${name.toUpperCase()}: ${filters[name].toUpperCase()}`);
  const activeSearch = search.trim() ? [`TOKEN SEARCH: ${search.trim().toUpperCase()}`] : [];
  const filterLines = [...activeTraits, ...activeSearch];
  const textRow = 32;
  const metadataHeight = 200 + Math.max(1, filterLines.length) * textRow;
  const gridTop = metadataHeight;
  const height = gridTop + rows * cell + Math.max(0, rows - 1) * gap + 136;

  // Browsers cap canvas dimensions. 512 faces fit comfortably at these settings.
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = GREEN;
  ctx.fillStyle = GREEN;
  ctx.lineWidth = 2;

  const label = (value: string, x: number, y: number, size: number, align: CanvasTextAlign = "left") => {
    ctx.fillStyle = GREEN;
    ctx.font = `${size}px "Departure Mono", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillText(value, x, y);
  };

  label("64 FACES", margin, 64, 58);
  label("FILTER8 / ROBINHOOD CHAIN", width - margin, 84, 19, "right");
  ctx.beginPath();
  ctx.moveTo(margin, 136);
  ctx.lineTo(width - margin, 136);
  ctx.stroke();

  label(`${gallery.length} FACES / 8×8 / 1 BIT`, margin, 159, 21);
  label(`SORT: ${sort.toUpperCase()}`, width - margin, 159, 18, "right");
  if (filterLines.length === 0) {
    label("FILTER: ALL TRAITS", margin, 203, 19);
  } else {
    filterLines.forEach((line, index) => label(line, margin, 203 + index * textRow, 18));
  }

  gallery.forEach((face, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + col * (cell + gap);
    const y = gridTop + row * (cell + gap);
    const inset = 14;
    const artworkSize = 128;
    const artworkX = x + (cell - artworkSize) / 2;
    const artworkY = y + inset;

    ctx.strokeStyle = GREEN;
    ctx.strokeRect(x, y, cell, cell);
    ctx.fillStyle = face.background;
    ctx.fillRect(artworkX, artworkY, artworkSize, artworkSize);
    const px = artworkSize / 8;
    ctx.fillStyle = face.foreground;
    for (let yy = 0; yy < 8; yy++) {
      for (let xx = 0; xx < 8; xx++) {
        if (face.rows[yy] & (1 << (7 - xx))) {
          ctx.fillRect(artworkX + xx * px, artworkY + yy * px, px, px);
        }
      }
    }
    label(`#${face.id}`, x + 10, y + 150, 14);
    const rank = ranks.get(face.id);
    if (rank !== undefined) label(`R${rank}`, x + cell - 10, y + 150, 14, "right");
  });

  const footerY = height - 92;
  ctx.strokeStyle = GREEN;
  ctx.beginPath();
  ctx.moveTo(margin, footerY);
  ctx.lineTo(width - margin, footerY);
  ctx.stroke();
  label("64FACES.FILTER8.XYZ", margin, footerY + 24, 19);
  label("GENERATED FROM ON-CHAIN PIXELS", width - margin, footerY + 24, 17, "right");

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not prepare gallery PNG");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const suffix = filterLines.length ? "filtered" : "all";
  link.download = `64faces-gallery-${suffix}-${gallery.length}.png`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rarityScore(face: Face, totals: Record<string, Record<string, number>>, supply: number) {
  if (supply <= 0) return 0;
  return TRAIT_NAMES.reduce((sum, name) => {
    const value = face.traits[name];
    const amount = totals[name]?.[value];
    return sum + (amount ? supply / amount : 0);
  }, 0);
}

export default function Home() {
  const [mintBusy, setMintBusy] = useState(false);
  const [mintMessage, setMintMessage] = useState("");
  const [soldOut, setSoldOut] = useState(false);
  const [mintQty, setMintQty] = useState(1);
  const [mintPrice, setMintPrice] = useState<bigint | null>(null);
  const [mintCap, setMintCap] = useState<bigint | null>(null);
  const [mintSupply, setMintSupply] = useState<bigint | null>(null);
  const [walletMintLimit, setWalletMintLimit] = useState<bigint | null>(null);
  const refreshMint = useCallback(async () => {
    try {
      const [price, cap, supply, walletLimit] = await Promise.all([
        mintClient.readContract({address: CONTRACT, abi: mintAbi, functionName: "price"}),
        mintClient.readContract({address: CONTRACT, abi: mintAbi, functionName: "maxSupply"}),
        mintClient.readContract({address: CONTRACT, abi: mintAbi, functionName: "totalSupply"}),
        mintClient.readContract({address: CONTRACT, abi: mintAbi, functionName: "maxMintsPerWallet"}),
      ]);
      setMintPrice(price);setMintCap(cap);setMintSupply(supply);setWalletMintLimit(walletLimit);setSoldOut(cap !== 0n && supply >= cap);
    } catch { setMintMessage("Mint data unavailable. Please try refreshing."); }
  }, []);
  useEffect(() => { void Promise.resolve().then(refreshMint); }, [refreshMint]);
  async function mintFaces() {
    if (mintBusy) return;
    setMintBusy(true);setMintMessage("");
    try {
      const p = (window as Window & {ethereum?: InjectedWallet}).ethereum;
      if (!p) throw Error("Connect an EVM wallet to mint.");
      const [liveSupply, cap, price] = await Promise.all([
        mintClient.readContract({address:CONTRACT,abi:mintAbi,functionName:"totalSupply"}),
        mintClient.readContract({address:CONTRACT,abi:mintAbi,functionName:"maxSupply"}),
        mintClient.readContract({address:CONTRACT,abi:mintAbi,functionName:"price"}),
      ]);
      if (cap !== 0n && liveSupply + BigInt(mintQty) > cap) {setSoldOut(liveSupply >= cap);throw Error("Not enough Faces remaining for that quantity.");}
      if (!Number.isSafeInteger(mintQty) || mintQty < 1 || mintQty > 20) throw Error("Choose between 1 and 20 Faces.");
      const accounts=await p.request({method:"eth_requestAccounts"}) as string[];
      if (!accounts?.[0] || !/^0x[0-9a-fA-F]{40}$/.test(accounts[0])) throw Error("No wallet account selected.");
      const wallet=accounts[0] as Address;
      const chainId=await p.request({method:"eth_chainId"}) as string;
      if (Number(BigInt(chainId)) !== mintChain.id) {
        try {await p.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x1237"}]});}
        catch {await p.request({method:"wallet_addEthereumChain",params:[{chainId:"0x1237",chainName:mintChain.name,nativeCurrency:mintChain.nativeCurrency,rpcUrls:[mintChain.rpcUrls.default.http[0]]}]});await p.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x1237"}]});}
      }
      await mintClient.simulateContract({address:CONTRACT,abi:mintAbi,functionName:"mint",args:[BigInt(mintQty)],value:price * BigInt(mintQty),account:wallet});
      const client=createWalletClient({account:wallet,chain:mintChain,transport:custom(p)});
      const hash=await client.writeContract({address:CONTRACT,abi:mintAbi,functionName:"mint",args:[BigInt(mintQty)],value:price * BigInt(mintQty),account:wallet,chain:mintChain});
      setMintMessage("MINT SUBMITTED · WAITING FOR CONFIRMATION");
      const receipt=await mintClient.waitForTransactionReceipt({hash});
      if(receipt.status!=="success") throw Error("Mint transaction reverted.");
      setMintMessage("MINT CONFIRMED · REFRESH TO SEE YOUR FACE"); void refreshMint();
    } catch (e) {setMintMessage(e instanceof Error?e.message:"Mint failed");}
    finally {setMintBusy(false);}
  }

  const [faces, setFaces] = useState<Face[]>([]);
  const [totalSupply, setTotalSupply] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState("token");
  const [showCount, setShowCount] = useState(48);
  const [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  const [exportingGallery, setExportingGallery] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function fetchAll() {
      setLoading(true);
      setLoadError("");
      setFaces([]);
      setSelectedId(null);
      setTotalSupply(null);
      let cursor: number | null = null;
      const collected: Face[] = [];
      try {
        do {
          const url = new URL("/api/faces", window.location.origin);
          url.searchParams.set("limit", String(PAGE_SIZE));
          if (cursor !== null) url.searchParams.set("cursor", String(cursor));
          const response = await fetch(url.toString(), { signal: controller.signal });
          const body = (await response.json()) as Batch;
          if (!response.ok) throw new Error(body.error || "Could not reach the blockchain API");
          if (cancelled) return;
          collected.push(...body.faces);
          setFaces([...collected]);
          setTotalSupply(body.totalSupply);
          setSelectedId((current) => current ?? body.faces[0]?.id ?? null);
          cursor = body.nextCursor;
          // Guard against bad pagination or an unexpectedly changing collection.
          if (collected.length > 512) throw new Error("Unexpected number of faces");
        } while (cursor !== null);
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Could not load faces");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchAll();
    return () => { cancelled = true; controller.abort(); };
  }, [retry]);

  const complete = !loading && !loadError && totalSupply !== null && faces.length === totalSupply;
  const selected = faces.find((face) => face.id === selectedId) || faces[0] || null;

  const counts = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const name of TRAIT_NAMES) result[name] = {};
    for (const face of faces) {
      for (const name of TRAIT_NAMES) {
        const value = face.traits[name] || "Unknown";
        result[name][value] = (result[name][value] || 0) + 1;
      }
    }
    return result;
  }, [faces]);

  const ranks = useMemo(() => {
    if (!complete) return new Map<number, number>();
    const byRarity = [...faces].sort((a, b) => rarityScore(b, counts, faces.length) - rarityScore(a, counts, faces.length) || a.id - b.id);
    return new Map(byRarity.map((face, i) => [face.id, i + 1]));
  }, [faces, counts, complete]);

  const matching = useMemo(() => {
    const query = search.trim().replace(/^#/, "");
    const results = faces.filter((face) => {
      if (query && !String(face.id).includes(query)) return false;
      return TRAIT_NAMES.every((name) => !filters[name] || filters[name] === FILTER_ALL || face.traits[name] === filters[name]);
    });
    if (sort === "rare" && complete) results.sort((a, b) => (ranks.get(a.id) || 9999) - (ranks.get(b.id) || 9999));
    else if (sort === "common" && complete) results.sort((a, b) => (ranks.get(b.id) || 0) - (ranks.get(a.id) || 0));
    else if (sort === "reverse") results.sort((a, b) => b.id - a.id);
    else results.sort((a, b) => a.id - b.id);
    return results;
  }, [faces, filters, search, sort, complete, ranks]);

const goSelected = useCallback((delta: number) => {
  if (!faces.length || !selected) return;
  const at = faces.findIndex((face) => face.id === selected.id);
  setSelectedId(faces[(at + delta + faces.length) % faces.length].id);
}, [faces, selected]);

const chooseRandom = useCallback(() => {
  if (!faces.length) return;

  const randomIndex = Math.floor(Math.random() * faces.length);
  setSelectedId(faces[randomIndex].id);
}, [faces]);



  async function downloadGallery() {
    if (!complete || matching.length === 0 || exportingGallery) return;
    setExportingGallery(true);
    setExportError("");
    try {
      await exportGalleryPNG(matching, filters, sort, search, ranks);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not export gallery");
    } finally {
      setExportingGallery(false);
    }
  }

  const selectedRank = selected && complete ? ranks.get(selected.id) : undefined;
  const countLabel = complete ? `${faces.length} / ${faces.length} INDEXED` : `${faces.length} / ${totalSupply ?? "—"} LOADING ON-CHAIN`;

  return (
    <>
      <header className="site-header">
        <div className="shell header-content">
          <a className="wordmark" href="#top" aria-label="64 Faces home">64 FACES</a>
          <nav className="top-links" aria-label="Main navigation">
            <a href="/game">GAME ↗</a>
            <a href="#my-faces">MY FACES</a>
            <a href="#explore">EXPLORE</a>
            <a href="#api">API</a>
            <a href="#about">ABOUT</a>
            <a href="https://filter8.xyz" target="_blank" rel="noreferrer">FILTER8 ↗</a>
          </nav>
        </div>
      </header>

      <main id="top" className="shell">
        <section className="hero" aria-label="64 Faces introduction">
          <div>
            <div className="kicker">[ ROBINHOOD CHAIN ]</div>
            <h1>64<br />FACES.</h1>
            <p className="hero-copy">64 PIXELS. 2 COLORS. 512 POSSIBLE FACES.<br /><br />A ONE-PROMPT EXPERIMENT IN GENERATIVE ART, AI AND CREATIVE CONSTRAINTS. EVERY FACE IS AN 8×8 BITMAP RENDERED BY A FULLY ON-CHAIN SMART CONTRACT.</p>
            <div className="hero-actions"><a className="outline-btn" href="/game">▶ PLAY FACE64 / DAILY ARCADE →</a><a className="outline-btn" href="#my-faces">MY FACES / CLAIM PRIZES →</a><a className="outline-btn" href="#mint-face">{soldOut ? "BUY ON OPENSEA ↗" : "MINT A FACE ↓"}</a></div>

            <div className="hero-data">
              <div><span>GRID</span><strong>8 × 8</strong></div>
              <div><span>PALETTE</span><strong>1 BIT</strong></div>
              <div><span>MAX SUPPLY</span><strong>512</strong></div>
            </div>
          </div>
          <div>
            <div className="hero-image"><PixelFace face={selected} /></div>
            <div className="hero-actions">
              <button type="button" className="outline-btn" onClick={() => goSelected(-1)} disabled={!selected}>← PREV</button>
              <button type="button" className="outline-btn" onClick={chooseRandom} disabled={!selected}>RANDOM</button>
              <button type="button" className="outline-btn" onClick={() => goSelected(1)} disabled={!selected}>NEXT →</button>
              <button type="button" className="outline-btn" onClick={() => selected && void exportPNG(selected, "art", selectedRank)} disabled={!selected}>↓ PNG</button>
            </div>
            <div className="status" style={{ marginTop: 12 }}>FACE #{selected?.id ?? "—"} {selectedRank ? `/ RARITY RANK ${selectedRank} OF ${faces.length}` : "/ ON-CHAIN ART"}</div>
          </div>
        </section>

        <section className="section" id="explore">
          <div className="section-top">
            <h2 className="section-title">[ EXPLORE THE FACES ]</h2>
            <span className="status" aria-live="polite">{countLabel}</span>
          </div>
          <div className="toolbar">
            {TRAIT_NAMES.map((name) => (
              <label key={name}>
                <span>{name.toUpperCase()}</span>
                <select
                  value={filters[name] || FILTER_ALL}
                  onChange={(event) => { setFilters((old) => ({ ...old, [name]: event.target.value })); setShowCount(48); }}
                >
                  <option value={FILTER_ALL}>ALL ({faces.length})</option>
                  {Object.entries(counts[name] || {}).sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => (
                    <option key={value} value={value}>{value.toUpperCase()} ({count})</option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              <span>SORT</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="token">TOKEN ID ↑</option>
                <option value="reverse">TOKEN ID ↓</option>
                <option value="rare" disabled={!complete}>RAREST FIRST</option>
                <option value="common" disabled={!complete}>MOST COMMON FIRST</option>
              </select>
            </label>
            <label>
              <span>FIND TOKEN</span>
              <input aria-label="Search token number" className="outline-btn" style={{ width: "100%" }} value={search} onChange={(event) => { setSearch(event.target.value); setShowCount(48); }} placeholder="# ID" inputMode="numeric" />
            </label>
          </div>
          <div className="toolbar-bottom">
            <span>{matching.length} MATCHES {complete ? "/ FULL MINTED SUPPLY" : "/ LOADED SO FAR"}</span>
            <div className="gallery-export-actions">
              <button type="button" className="outline-btn" onClick={() => void downloadGallery()} disabled={!complete || matching.length === 0 || exportingGallery}>
                {exportingGallery ? "PREPARING PNG…" : `↓ EXPORT GRID PNG (${matching.length})`}
              </button>
              <button type="button" className="outline-btn" onClick={() => { setFilters({}); setSearch(""); setSort("token"); setShowCount(48); }}>RESET FILTERS ↺</button>
            </div>
          </div>
          {exportError && <div className="empty" role="alert">{exportError.toUpperCase()}</div>}
          {loadError && (
            <div className="empty" role="alert">{loadError.toUpperCase()}<div style={{ marginTop: 14 }}><button type="button" className="outline-btn" onClick={() => setRetry((value) => value + 1)}>RETRY LOADING ↻</button></div></div>
          )}
          {!loadError && !faces.length && <div className="empty">FETCHING ART DIRECTLY FROM ROBINHOOD CHAIN…</div>}
          {faces.length > 0 && matching.length === 0 && <div className="empty">NO FACES MATCH THESE TRAITS.</div>}
          {matching.length > 0 && (
            <>
              <div className="face-grid">
                {matching.slice(0, showCount).map((face) => (
                  <button className={`face-tile ${selected?.id === face.id ? "is-selected" : ""}`} type="button" key={face.id}
                    onClick={() => { setSelectedId(face.id); document.getElementById("inspector")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                    aria-label={`Inspect face ${face.id}`}>
                    <PixelFace face={face} />
                    <div className="tile-footer"><span>#{face.id}</span><span>{complete ? `R${ranks.get(face.id)}` : "—"}</span></div>
                  </button>
                ))}
              </div>
              {showCount < matching.length && (
                <div style={{ textAlign: "center", marginTop: 25 }}><button className="outline-btn" onClick={() => setShowCount((old) => old + 48)}>LOAD MORE ({matching.length - showCount} REMAIN) ↓</button></div>
              )}
            </>
          )}

          {selected && (
            <section className="inspector" id="inspector" aria-label="Selected face details">
              <div className="inspector-face"><PixelFace face={selected} /></div>
              <div>
                <h3>FACE #{selected.id}</h3>
                <p style={{ margin: "0 0 18px" }}>{selectedRank ? `RARITY RANK #${selectedRank} / ${faces.length} MINTED` : "INDEXING THE MINTED SUPPLY FOR RARITY…"}</p>
                <div className="trait-list">
                  {TRAIT_NAMES.map((name) => {
                    const value = selected.traits[name] || "UNKNOWN";
                    const count = counts[name]?.[value] || 0;
                    return <div className="trait" key={name}><span>{name.toUpperCase()}</span><span>{value.toUpperCase()}{complete ? ` · ${count}/${faces.length} (${(count / faces.length * 100).toFixed(1)}%)` : ""}</span></div>;
                  })}
                </div>
                <div className="inspector-actions">
                  <button type="button" className="outline-btn" onClick={() => void exportPNG(selected, "art", selectedRank)}>↓ EXPORT FRAMED PNG</button>
                  <button type="button" className="outline-btn" onClick={() => void exportPNG(selected, "card", selectedRank)}>↓ EXPORT TRAIT CARD</button>
                  <a className="outline-btn" href={`https://opensea.io/assets/robinhood/${CONTRACT}/${selected.id}`} target="_blank" rel="noreferrer">OPENSEA ↗</a>
                  <a className="outline-btn" href={`${EXPLORER}?tab=contract`} target="_blank" rel="noreferrer">CONTRACT ↗</a>
                  <a className="outline-btn" href={`/api/face/${selected.id}`} target="_blank" rel="noreferrer">PIXEL DATA ↗</a>
                </div>
              </div>
            </section>
          )}
        </section>

        <section className="section" id="mint-face">
          <div className="section-top"><h2 className="section-title">[ MINT A FACE ]</h2><span>FULLY ON-CHAIN · ROBINHOOD CHAIN</span></div>
          <div style={{border:"1px solid #CCFF00",padding:"clamp(20px, 4vw, 38px)",maxWidth:900,margin:"0 auto",display:"grid",gap:28}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:16,flexWrap:"wrap"}}>
              <div style={{display:"grid",gap:12}}>
                <div className="kicker">64 FACES / PUBLIC MINT</div>
                <h3 style={{fontWeight:400,fontSize:"clamp(23px,4vw,36px)",margin:0}}>{soldOut ? "ALL FACES MINTED" : "YOUR NEXT ARCADE IDENTITY"}</h3>
                <p className="status" style={{margin:0}}>512 UNIQUE 8×8 FACES · FULLY ON-CHAIN</p>
              </div>
              <div style={{border:"1px solid #CCFF00",padding:"12px 18px",minWidth:160,textAlign:"center"}}>
                <span style={{display:"block",fontSize:11}}>MINTED</span>
                <strong style={{display:"block",fontWeight:400,fontSize:24,marginTop:6}}>{mintSupply === null ? "…" : `${mintSupply.toString()} / ${(mintCap ?? 512n).toString()}`}</strong>
              </div>
            </div>
            <div style={{height:1,background:"#CCFF00",opacity:.7}} />
            {soldOut ? <a className="outline-btn face-action-primary" href={OPENSEA} target="_blank" rel="noreferrer" style={{textAlign:"center",padding:18}}>BUY ON OPENSEA ↗</a> : <div style={{display:"grid",gap:22}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                <label htmlFor="face-mint-quantity" style={{fontSize:13}}>QUANTITY</label>
                <div style={{display:"grid",gridTemplateColumns:"52px 74px 52px",height:50,border:"1px solid #CCFF00"}}>
                  <button type="button" aria-label="Decrease quantity" disabled={mintBusy || mintQty <= 1} onClick={() => setMintQty(n => Math.max(1,n-1))} style={{border:0,borderRight:"1px solid #CCFF00",background:"transparent",fontSize:22}}>−</button>
                  <input id="face-mint-quantity" aria-label="Mint quantity" type="number" min={1} max={20} value={mintQty} onChange={e => {const n=Number(e.target.value);if(Number.isInteger(n))setMintQty(Math.max(1,Math.min(20,n)));}} style={{width:"100%",minWidth:0,background:"#000",border:0,textAlign:"center",appearance:"textfield"}} />
                  <button type="button" aria-label="Increase quantity" disabled={mintBusy || mintQty >= 20} onClick={() => setMintQty(n => Math.min(20,n+1))} style={{border:0,borderLeft:"1px solid #CCFF00",background:"transparent",fontSize:22}}>+</button>
                </div>
              </div>
              <div style={{display:"grid",gap:14}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center"}}><span>PRICE PER FACE</span><strong style={{fontSize:16,fontWeight:400}}>{mintPrice === null ? "…" : `${Number(mintPrice)/1e18} ETH`}</strong></div>
                <div style={{height:1,background:"#CCFF00",opacity:.45}} />
                <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center"}}><span>TOTAL</span><strong style={{fontSize:22,fontWeight:400}}>{mintPrice === null ? "…" : `${(Number(mintPrice)*mintQty/1e18).toFixed(4)} ETH`}</strong></div>
              </div>
              <button type="button" disabled={mintBusy || mintPrice === null} onClick={() => void mintFaces()} style={{width:"100%",background:"#CCFF00",color:"#000000",border:"1px solid #CCFF00",padding:"18px 20px",fontSize:16,fontWeight:400}}>{mintBusy ? "CONFIRMING…" : `MINT ${mintQty} FACE${mintQty===1?"":"S"} →`}</button>
              {walletMintLimit !== null && walletMintLimit > 0n && <p className="status" style={{margin:0,opacity:.8}}>MAX {walletMintLimit.toString()} PUBLIC MINTS PER WALLET · CONTRACT ENFORCED</p>}
            </div>}
            {mintMessage && <p className="status" role="status" style={{margin:0}}>{mintMessage}</p>}
          </div>
        </section>
        <FaceProfile supply={totalSupply} firstId={faces[0]?.id ?? 1} />

        <section className="section" id="about">
          <div className="section-top"><h2 className="section-title">[ ABOUT THE EXPERIMENT ]</h2><span>ONE PROMPT / FULLY ON-CHAIN</span></div>
          <div className="body-text">
            <p>64 FACES BEGAN WITH ONE QUESTION: WHAT HAPPENS WHEN AN AI IS GIVEN ONLY 64 PIXELS, TWO COLORS AND THE TASK OF CREATING AN ENTIRE GENERATIVE COLLECTION?</p>
            <p>THE RESULT IS A SOLIDITY-BASED DRAWING SYSTEM WITH SEVEN TRAIT CATEGORIES: PALETTE, HEAD SHAPE, HAIR, EYES, EYEBROWS, EXPRESSION AND ACCESSORY. THE ARTWORK AND ITS METADATA ARE GENERATED DIRECTLY BY THE CONTRACT ON ROBINHOOD CHAIN.</p>
            <p>WHO IS THE ARTIST — THE PERSON WRITING THE PROMPT, THE AI INTERPRETING IT, OR THE CODE RENDERING EACH FACE?</p>
            <p>64 FACES ARE PLAYABLE IDENTITIES IN THE FACE64 ARCADE. CONNECT YOUR WALLET TO MANAGE YOUR FACE ACCOUNT AND CLAIM GAME PRIZES.</p>
          </div>
          <div className="link-row">
            <a className="outline-btn" href={OPENSEA} target="_blank" rel="noreferrer">OPENSEA ↗</a>
            <a className="outline-btn" href={BAZAAR} target="_blank" rel="noreferrer">NET BAZAAR ↗</a>
            <a className="outline-btn" href={ORIGINAL} target="_blank" rel="noreferrer">ORIGINAL PROMPT ↗</a>
            <a className="outline-btn" href={EXPLORER} target="_blank" rel="noreferrer">SMART CONTRACT ↗</a>
          </div>
        </section>

        <section className="section" id="api">
          <div className="section-top"><h2 className="section-title">[ 64 PIXELS IN THE REAL WORLD ]</h2><span>ESP32 / 8×8 LED MATRIX</span></div>
          <div className="body-text">
            <p>THE SAME BITMAPS CAN POWER A PHYSICAL 8×8 LED DISPLAY. AN ESP32, TWO BUTTONS, AND A TINY WINDOW INTO THE BLOCKCHAIN.</p>
            <p>THE PUBLIC PIXEL API RETURNS EIGHT ROW BYTES PER FACE, ALONG WITH THE EXACT ON-CHAIN COLORS AND TRAITS. BIT 7 IS THE LEFTMOST PIXEL.</p>
          </div>
          <div className="link-row"><a className="outline-btn" target="_blank" rel="noreferrer" href={`/api/face/${selected?.id ?? 1}`}>VIEW JSON API ↗</a></div>
        </section>


      </main>
      <footer className="shell footer"><span>64 FACES / 8×8 / #000000 + #CCFF00</span><a href="https://filter8.xyz" target="_blank" rel="noreferrer">AN EXPERIMENT BY FILTER8 ↗</a></footer>
    </>
  );
}
