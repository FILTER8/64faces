"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Face } from "@/lib/shared";
import { BLACK, CONTRACT, GREEN, TRAIT_NAMES } from "@/lib/shared";

type Batch = { faces: Face[]; totalSupply: number; firstTokenId: number; nextCursor: number | null; error?: string };
const OPENSEA = "https://opensea.io/collection/64-faces";
const BAZAAR = `https://www.netprotocol.app/app/bazaar/robinhood/${CONTRACT}`;
const ORIGINAL = "https://x.com/0xfilter8/status/2108099493740646415";
const EXPLORER = `https://robinhoodchain.blockscout.com/address/${CONTRACT}`;
const FILTER_ALL = "__all__";
const PAGE_SIZE = 24;

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

// FACE64: GREEN is the only safe color. Every successful stop removes one
// green pixel; a black stop loads a different face after the roulette settles.
function FaceGame({ face, onMiss }: { face: Face | null; onMiss: () => void }) {
  const [phase, setPhase] = useState<"idle" | "spinning" | "slowing" | "finished" | "changing">("idle");
  const [position, setPosition] = useState(0);
  const [outcome, setOutcome] = useState<"HIT" | "MISS" | null>(null);
  const [removed, setRemoved] = useState<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    if (phase !== "spinning") return;
    const interval = window.setInterval(() => {
      setPosition((current) => (current + 1) % 64);
    }, 85);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => clearTimers, [clearTimers]);

  // Always evaluate what players SEE, including inverted-palette NFTs.
  // After a HIT, that green cell turns black and cannot score again.
  const isGreen = (index: number): boolean => {
    if (!face || removed.includes(index)) return false;
    const y = Math.floor(index / 8);
    const x = index % 8;
    const setBit = (face.rows[y] & (1 << (7 - x))) !== 0;
    return (setBit ? face.foreground : face.background).toUpperCase() === GREEN;
  };

  const originalGreen = face
    ? Array.from({ length: 64 }, (_, index) => {
        const y = Math.floor(index / 8);
        const x = index % 8;
        const setBit = (face.rows[y] & (1 << (7 - x))) !== 0;
        return (setBit ? face.foreground : face.background).toUpperCase() === GREEN;
      }).filter(Boolean).length
    : 0;
  const remaining = originalGreen - removed.length;

  function toggleGame() {
    if (!face || phase === "slowing" || phase === "changing") return;

    if (phase !== "spinning") {
      clearTimers();
      setOutcome(null);
      setPosition((current) => (current + 1) % 64);
      setPhase("spinning");
      return;
    }

    // Stop does not instantly freeze: advance 9 more cells with increasing
    // delays, then evaluate the ACTUAL final cell after the slowdown.
    const startPosition = position;
    const delays = [75, 90, 110, 140, 180, 235, 310, 410, 550];
    const landingPosition = (startPosition + delays.length) % 64;
    const hit = isGreen(landingPosition);
    setPhase("slowing");
    let elapsed = 0;
    delays.forEach((delay, index) => {
      elapsed += delay;
      timers.current.push(window.setTimeout(() => {
        setPosition((startPosition + index + 1) % 64);
        if (index !== delays.length - 1) return;
        setOutcome(hit ? "HIT" : "MISS");
        if (hit) {
          setRemoved((current) => [...current, landingPosition]);
          if (remaining === 1) {
            setPhase("changing");
            timers.current.push(window.setTimeout(onMiss, 1250));
          } else {
            setPhase("finished");
          }
        } else {
          setPhase("changing");
          timers.current.push(window.setTimeout(onMiss, 1250));
        }
      }, elapsed));
    });
  }

  const scanning = phase === "spinning" || phase === "slowing";
  return (
    <div className="mini-game">
      <div className="mini-game-screen">
        <div className="mini-game-topline">
          <span>FACE64 / ONE BUTTON</span>
          <span>{face ? `FACE #${face.id}` : "LOADING FACE"}</span>
        </div>
        <div className="mini-game-board-frame" style={{ border: `4px solid ${GREEN}`, padding: 8, background: BLACK, width: "min(100%, 344px)", margin: "0 auto", boxSizing: "border-box" }}>
          <div className="mini-game-board" role="img" aria-label={face ? `Face ${face.id}: ${remaining} green pixels remaining` : "Loading face"} style={{ background: BLACK, width: "100%", margin: 0, padding: 0, border: 0, gap: 0 }}>
            {face && face.rows.flatMap((_row, y) =>
              Array.from({ length: 8 }, (_, x) => {
                const index = y * 8 + x;
                const green = isGreen(index);
                const active = scanning && position === index;
                // The cursor stays visible by inverting the underlying cell.
                const pixelColor = active ? (green ? BLACK : GREEN) : (green ? GREEN : BLACK);
                return (
                  <span key={`${x}-${y}`} className="mini-game-pixel" style={{ backgroundColor: pixelColor, display: "block" }} />
                );
              })
            )}
          </div>
        </div>
        <div className="mini-game-topline" style={{ marginTop: 14, marginBottom: 0 }}>
          <span>GREEN PIXELS LEFT {remaining} / {originalGreen}</span>
          <span>HITS {removed.length}</span>
        </div>
        <div className="mini-game-controls">
          <button type="button" className="outline-btn mini-game-button" onClick={toggleGame} disabled={!face || phase === "slowing" || phase === "changing"}>
            {phase === "spinning" ? "■ STOP" : phase === "slowing" ? "STOPPING…" : phase === "changing" ? "NEXT FACE…" : outcome ? "▶ START AGAIN" : "▶ START"}
          </button>
          <span className="mini-game-result" role="status" aria-live="polite">
            {phase === "spinning" ? "SCANNING…" : phase === "slowing" ? "SLOWING DOWN…" : outcome === "HIT" ? (phase === "changing" ? "ALL GREEN CLEARED / NEXT FACE…" : "GREEN HIT / PIXEL REMOVED / GO AGAIN") : outcome === "MISS" ? "BLACK / MISS / NEW FACE…" : "STOP ON GREEN TO CONTINUE"}
          </span>
        </div>
      </div>
      <p className="mini-game-hint">ONLY GREEN PIXELS COUNT. STOP ON GREEN TO REMOVE ONE PIXEL AND CONTINUE WITH THE SAME FACE. STOP ON BLACK AND A NEW TOKEN LOADS. $OCH GAME TOKEN INTEGRATION IS A FUTURE EXPERIMENT.</p>
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
    const options = faces.filter((face) => face.id !== selected?.id);
    const pool = options.length ? options : faces;
    setSelectedId(pool[Math.floor(Math.random() * pool.length)].id);
  }, [faces, selected]);

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
            <a href="#explore">EXPLORE</a>
            <a href="#api">API</a>
            <a href="#game">GAME</a>
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

        <section className="section" id="about">
          <div className="section-top"><h2 className="section-title">[ ABOUT THE EXPERIMENT ]</h2><span>ONE PROMPT / FULLY ON-CHAIN</span></div>
          <div className="body-text">
            <p>64 FACES BEGAN WITH ONE QUESTION: WHAT HAPPENS WHEN AN AI IS GIVEN ONLY 64 PIXELS, TWO COLORS AND THE TASK OF CREATING AN ENTIRE GENERATIVE COLLECTION?</p>
            <p>THE RESULT IS A SOLIDITY-BASED DRAWING SYSTEM WITH SEVEN TRAIT CATEGORIES: PALETTE, HEAD SHAPE, HAIR, EYES, EYEBROWS, EXPRESSION AND ACCESSORY. THE ARTWORK AND ITS METADATA ARE GENERATED DIRECTLY BY THE CONTRACT ON ROBINHOOD CHAIN.</p>
            <p>WHO IS THE ARTIST — THE PERSON WRITING THE PROMPT, THE AI INTERPRETING IT, OR THE CODE RENDERING EACH FACE?</p>
            <p>NO MINTING ON THIS WEBSITE. THIS IS AN ARCHIVE AND EXPLORER FOR THE EXISTING ON-CHAIN COLLECTION.</p>
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

        <section className="section" id="game">
          <div className="section-top">
            <h2 className="section-title">[ GAME / FACE64 ]</h2>
            <span>ONE FACE / ONE BUTTON / REMOVE THE PIXELS</span>
          </div>
          <div className="body-text">
            <p>PRESS START TO SCAN THE 8×8 BOARD. PRESS STOP TO SLOW DOWN. LAND ON GREEN TO REMOVE THAT PIXEL AND CONTINUE WITH THE SAME FACE. LAND ON BLACK AND A NEW FACE LOADS.</p>
          </div>
          <FaceGame key={selected?.id ?? "no-face"} face={selected} onMiss={chooseRandom} />
        </section>
      </main>
      <footer className="shell footer"><span>64 FACES / 8×8 / #000000 + #CCFF00</span><a href="https://filter8.xyz" target="_blank" rel="noreferrer">AN EXPERIMENT BY FILTER8 ↗</a></footer>
    </>
  );
}
