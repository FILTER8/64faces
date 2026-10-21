"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, encodeFunctionData, formatUnits, http, isAddress, parseAbi, type Address } from "viem";
import { CONTRACT } from "@/lib/shared";

type EthProvider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
const NETWORK = { id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } } } as const;
const rpc = createPublicClient({ chain: NETWORK, transport: http(NETWORK.rpcUrls.default.http[0]) });
const TOURNAMENT = "0x753aa3bFd757D62e69389D90359bCB0c315b7c38" as const;
const OCH = "0x8BDD5adFF8A9D08372323d5BAF5e8e52605AF983" as const;
const tournamentAbi = parseAbi([
  "function walletFor(address collection,uint256 tokenId) view returns (address)",
  "function tournaments(uint256 day) view returns (uint32 entrants,uint32 results,uint32 winnerCount,uint256 pool,uint256 lockedFee,bool configLocked,bool finalized,bool refundAll,address winningCollection,uint256 winningTokenId,uint256 winningScore)",
  "function getEntry(uint256 day,address collection,uint256 tokenId) view returns ((address payer,bool joined,bool resultSubmitted,bool refundClaimed,bool prizeClaimed,uint256 score,bytes32 gameId))",
  "function claimPrize(uint256 day,address collection,uint256 tokenId)",
]);
const nftAbi = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)"]);
const tokenAbi = parseAbi(["function balanceOf(address owner) view returns (uint256)", "function transfer(address to,uint256 value) returns (bool)"]);
const accountAbi = parseAbi(["function execute(address to,uint256 value,bytes data,uint8 operation) payable returns (bytes)"]);
const registryAbi = parseAbi(["function createAccount(address implementation,bytes32 salt,uint256 chainId,address tokenContract,uint256 tokenId) returns (address)"]);
const configAbi = parseAbi(["function faceRegistry() view returns (address)","function faceAccountImplementation() view returns (address)","function faceSalt() view returns (bytes32)"]);
const shorten = (a: string) => `${a.slice(0, 7)}…${a.slice(-5)}`;
const DAY = 86400000;
type Prize = { day: number; amount: bigint; claimable: boolean; claimed: boolean; refund: boolean };
type Artwork = { rows: number[]; background: string; foreground: string };

export default function FaceProfile({ supply, firstId }: { supply: number | null; firstId: number }) {
  const [wallet, setWallet] = useState<Address | null>(null);
  const [art, setArt] = useState<Record<number, Artwork>>({});
  const [artFailures, setArtFailures] = useState<number[]>([]);
  const [walletOpen, setWalletOpen] = useState(false);
  const [ids, setIds] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [tba, setTba] = useState<Address | null>(null);
  const [och, setOch] = useState<bigint>(0n);
  const [eth, setEth] = useState<bigint>(0n);
  const [deployed, setDeployed] = useState(false);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scanDays, setScanDays] = useState(30);
  const provider = useCallback((): EthProvider | null => typeof window === "undefined" ? null : ((window as Window & { ethereum?: EthProvider }).ethereum ?? null), []);
  const [today, setToday] = useState<number | null>(null);
  const [gameStats, setGameStats] = useState({ plays: 0, wins: 0 });
  const [statsReady, setStatsReady] = useState(false);
  useEffect(() => {
    // Defer the clock read until after hydration; Next.js prerender stays deterministic.
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setToday(Math.floor(Date.now() / DAY));
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const needed = ids.filter(id => !art[id] && !artFailures.includes(id));
    if (!needed.length) return;
    let cancelled = false;
    void Promise.all(needed.map(async id => {
      try {
        const r = await fetch(`/api/face/${id}`);
        if (!r.ok) throw Error("Face artwork unavailable");
        const data: Artwork = await r.json();
        if (!Array.isArray(data.rows) || data.rows.length !== 8 ||
          !data.rows.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ||
          !["#000000", "#CCFF00"].includes(data.background) ||
          !["#000000", "#CCFF00"].includes(data.foreground)) throw Error("Invalid Face artwork");
        if (!cancelled) setArt(old => ({ ...old, [id]: data }));
      } catch { if (!cancelled) setArtFailures(old => old.includes(id) ? old : [...old, id]); }
    }));
    return () => { cancelled = true; };
  }, [ids, art, artFailures]);

  const connect = useCallback(async () => {
    const p = provider();
    if (!p) { setMessage("Please open this page in a browser with an EVM wallet extension."); return; }
    try {
      const accounts = await p.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts?.[0] || !isAddress(accounts[0])) throw Error("No account was returned");
      setWallet(accounts[0] as Address); setRecipient(accounts[0]); setMessage("");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Wallet connection failed"); }
  }, [provider]);

  const refreshOwned = useCallback(async () => {
    if (!wallet || supply === null) return;
    setBusy(true); setMessage("Checking ownership on Robinhood Chain…");
    try {
      const found: number[] = [];
      // Batch calls in groups to avoid overwhelming the public RPC.
      for (let offset = 0; offset < supply; offset += 20) {
        const batch = Array.from({ length: Math.min(20, supply - offset) }, (_, i) => firstId + offset + i);
        const responses = await Promise.all(batch.map(async id => {
          try { return (await rpc.readContract({ address: CONTRACT, abi: nftAbi, functionName: "ownerOf", args: [BigInt(id)] })).toLowerCase() === wallet.toLowerCase() ? id : null; }
          catch { return null; }
        }));
        found.push(...responses.filter((id): id is number => id !== null));
      }
      setIds(found); setSelected(current => current !== null && found.includes(current) ? current : found[0] ?? null);
      setMessage(found.length ? `${found.length} owned Face${found.length === 1 ? "" : "s"} found.` : "No Faces found in this wallet.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Ownership lookup failed"); }
    finally { setBusy(false); }
  }, [wallet, supply, firstId]);
  useEffect(() => { void Promise.resolve().then(refreshOwned); }, [refreshOwned]);

  const refreshTba = useCallback(async () => {
    if (selected === null || today === null) { setTba(null); return; }
    setBusy(true); setStatsReady(false); setGameStats({ plays: 0, wins: 0 });
    try {
      const address = await rpc.readContract({ address: TOURNAMENT, abi: tournamentAbi, functionName: "walletFor", args: [CONTRACT, BigInt(selected)] });
      const [balance, native] = await Promise.all([
        rpc.readContract({ address: OCH, abi: tokenAbi, functionName: "balanceOf", args: [address] }),
        rpc.getBalance({ address }),
      ]);
      setTba(address); setOch(balance); setEth(native); setDeployed(Boolean(await rpc.getCode({ address })));
      const list: Prize[] = [];
      let plays = 0, wins = 0;
      const days = Array.from({ length: scanDays }, (_, i) => today - i - 1);
      for (let offset=0;offset<days.length;offset+=6) {
        const group=await Promise.all(days.slice(offset,offset+6).map(async day => {
        const [t, entry] = await Promise.all([
          rpc.readContract({ address: TOURNAMENT, abi: tournamentAbi, functionName: "tournaments", args: [BigInt(day)] }),
          rpc.readContract({ address: TOURNAMENT, abi: tournamentAbi, functionName: "getEntry", args: [BigInt(day), CONTRACT, BigInt(selected)] }),
        ]);
        const [ , , winnerCount, pool, , , finalized, refundAll, winningCollection, winningTokenId, winningScore ] = t;
        if (entry.resultSubmitted) plays++;
        if (!entry.joined || !finalized) return null;
        const winning = !refundAll && winnerCount > 0 && entry.resultSubmitted && entry.score === winningScore;
        if (winning) wins++;
        const dust = winningCollection.toLowerCase() === CONTRACT.toLowerCase() && winningTokenId === BigInt(selected) ? pool % BigInt(winnerCount || 1) : 0n;
        const reward = winning && winnerCount > 0 ? pool / BigInt(winnerCount) + dust : 0n;
        return winning ? { day, amount: reward, claimable: !entry.prizeClaimed, claimed: entry.prizeClaimed, refund: false } : null;
        }));
        list.push(...group.filter((p): p is Prize => p !== null));
      }
      setPrizes(list); setGameStats({ plays, wins }); setStatsReady(true);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not load Face account"); }
    finally { setBusy(false); }
  }, [selected, scanDays, today]);
  useEffect(() => { void Promise.resolve().then(refreshTba); }, [refreshTba]);

  const sendTransaction = useCallback(async (address: Address, abi: typeof tournamentAbi | typeof accountAbi | typeof registryAbi, functionName: "claimPrize" | "execute" | "createAccount", args: readonly unknown[]) => {
    if (!wallet) throw Error("Connect your wallet first");
    const p = provider(); if (!p) throw Error("Wallet not available");
    const hexId = await p.request({ method: "eth_chainId" }) as string;
    if (Number(BigInt(hexId)) !== NETWORK.id) {
      try { await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] }); }
      catch { await p.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x1237", chainName: NETWORK.name, nativeCurrency: NETWORK.nativeCurrency, rpcUrls: [...NETWORK.rpcUrls.default.http] }] });
        await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] }); }
    }
    const client = createWalletClient({ account: wallet, chain: NETWORK, transport: custom(p) });
    // viem ABI overload is checked by the wallet; only known calls are encoded.
    const data = encodeFunctionData({ abi, functionName, args: args as never });
    const hash = await client.sendTransaction({ to: address, data, value: 0n, account: wallet, chain: NETWORK });
    setMessage(`Transaction submitted: ${hash}. Waiting for confirmation…`);
    const receipt = await rpc.waitForTransactionReceipt({ hash, confirmations: 1 });
    if (receipt.status !== "success") throw Error("Transaction reverted");
    setMessage(`Confirmed: ${hash}`);
    await refreshTba();
  }, [wallet, provider, refreshTba]);

  const claim = async (day: number) => {
    if (selected === null) return;
    setBusy(true);
    try { await sendTransaction(TOURNAMENT, tournamentAbi, "claimPrize", [BigInt(day), CONTRACT, BigInt(selected)]); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Claim failed"); }
    finally { setBusy(false); }
  };
  const deployAccount = async () => {
    if (selected === null || !wallet || !tba) return;
    setBusy(true);
    try {
      const [registry, implementation, salt] = await Promise.all([
        rpc.readContract({ address: TOURNAMENT, abi: configAbi, functionName: "faceRegistry" }),
        rpc.readContract({ address: TOURNAMENT, abi: configAbi, functionName: "faceAccountImplementation" }),
        rpc.readContract({ address: TOURNAMENT, abi: configAbi, functionName: "faceSalt" }),
      ]);
      await sendTransaction(registry, registryAbi, "createAccount", [implementation, salt, 4663n, CONTRACT, BigInt(selected)]);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Account deployment failed"); }
    finally { setBusy(false); }
  };
  const transfer = async () => {
    if (selected === null || !tba || !wallet) return;
    if (!isAddress(recipient)) { setMessage("Enter a valid receiving address"); return; }
    if (recipient.toLowerCase() !== wallet.toLowerCase()) { setMessage("For this first version, the receiving address must be your connected wallet."); return; }
    if (!/^\d+(\.\d{1,18})?$/.test(amount)) { setMessage("Enter a valid OCH amount"); return; }
    const [whole, frac = ""] = amount.split(".");
    const raw = BigInt(whole) * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18));
    if (raw <= 0n || raw > och) { setMessage("Amount must be above zero and within the Face's OCH balance"); return; }
    setBusy(true);
    try {
      const owner = await rpc.readContract({ address: CONTRACT, abi: nftAbi, functionName: "ownerOf", args: [BigInt(selected)] });
      if (owner.toLowerCase() !== wallet.toLowerCase()) throw Error("Connected wallet no longer owns this Face");
      if (!deployed) throw Error("Face TBA is not deployed. The account must be deployed through its canonical ERC-6551 registry before sending.");
      const data = encodeFunctionData({ abi: tokenAbi, functionName: "transfer", args: [wallet, raw] });
      await sendTransaction(tba, accountAbi, "execute", [OCH, 0n, data, 0]);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Transfer failed"); }
    finally { setBusy(false); }
  };

  const exportPlayerCard = async () => {
    if (selected === null || !art[selected] || !statsReady) { setMessage("Face artwork and tournament history must finish loading first."); return; }
    const face = art[selected];
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, 1200, 630);
    ctx.strokeStyle = "#CCFF00"; ctx.lineWidth = 3; ctx.strokeRect(24, 24, 1152, 582);
    try { await document.fonts.load('28px "Departure Mono"'); } catch { /* use fallback */ }
    ctx.font = '26px "Departure Mono", monospace'; ctx.fillStyle = "#CCFF00";
    ctx.fillText("64 FACES / FACE64 PLAYER CARD", 66, 88);
    const edge = 368, x0 = 66, y0 = 140, px = edge / 8;
    ctx.fillStyle = face.background; ctx.fillRect(x0, y0, edge, edge);
    ctx.fillStyle = face.foreground;
    for (let y=0; y<8; y++) for (let x=0; x<8; x++) if (face.rows[y] & (128 >> x)) ctx.fillRect(x0+x*px,y0+y*px,px,px);
    ctx.fillStyle = "#CCFF00"; ctx.font = '48px "Departure Mono", monospace'; ctx.fillText(`FACE #${selected}`, 504, 210);
    ctx.font = '21px "Departure Mono", monospace'; ctx.fillText("RANKED TOURNAMENTS", 504, 268);
    const drawStat = (x: number, label: string, value: number) => {
      ctx.strokeStyle = "#CCFF00"; ctx.lineWidth = 2; ctx.strokeRect(x, 296, 284, 184);
      ctx.fillStyle = "#CCFF00"; ctx.font = '20px "Departure Mono", monospace'; ctx.fillText(label, x + 22, 336);
      ctx.font = 'bold 92px "Departure Mono", monospace'; ctx.fillText(String(value), x + 22, 448);
    };
    drawStat(504, "PLAYS", gameStats.plays);
    drawStat(812, "WINS", gameStats.wins);
    ctx.font = '17px "Departure Mono", monospace'; ctx.fillText(`LAST ${scanDays} DAYS · VERIFIED ON-CHAIN`, 504, 530);
    ctx.fillText("64faces.filter8.xyz/game", 66, 566);
    const link = document.createElement("a"); link.download = `64faces-${selected}-player-card.png`;
    link.href = canvas.toDataURL("image/png"); document.body.appendChild(link); link.click(); link.remove();
  };

  const formatted = useMemo(() => Number(formatUnits(och, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }), [och]);
  const faceTile = (id: number, large = false) => {
    const face = art[id];
    return <div className={`face-owner-pixels ${large ? "face-owner-pixels-large" : ""}`} role="img" aria-label={`On-chain artwork for Face #${id}`} style={{ background: face?.background ?? "#000000" }}>
      {face ? face.rows.flatMap((row,y) => Array.from({length:8}, (_,x) => <span key={`${y}-${x}`} style={{background: (row & (128 >> x)) ? face.foreground : face.background}} />)) :
      <span className="face-owner-loading">{artFailures.includes(id) ? "ART UNAVAILABLE" : `LOADING #${id}...`}</span>}
    </div>;
  };
  return (
    <section className="section" id="my-faces">
      <div className="section-top"><h2 className="section-title">[ MY FACES ]</h2><span>YOUR FACE. YOUR ARCADE IDENTITY.</span></div>
      <div className="hero-actions"><button type="button" className="outline-btn face-action-primary" onClick={() => void connect()}>{wallet ? `CONNECTED ${shorten(wallet)}` : "CONNECT WALLET"}</button>{wallet && <button type="button" className="outline-btn" disabled={busy} onClick={() => void refreshOwned()}>REFRESH</button>}</div>
      {wallet && <>
        <div className="face-profile-grid">{ids.map(id => <button type="button" className={`face-profile-token ${selected === id ? "active" : ""}`} key={id} onClick={() => setSelected(id)}>{faceTile(id)}<span>#{id}</span></button>)}{!busy && !ids.length && <span>NO OWNED FACES FOUND</span>}</div>
        {selected !== null && <div className="inspector face-profile-detail">
          <div className="face-profile-portrait">{faceTile(selected, true)}<h3>FACE #{selected}</h3><span>FACE64 ARCADE PLAYER</span></div>
          <div className="face-profile-info">
            <div className="kicker">[ FACE WALLET ]</div>
            <div className="face-profile-balances"><div><span>OCH BALANCE</span><strong>{formatted}</strong></div><div><span>ETH BALANCE</span><strong>{formatUnits(eth, 18).slice(0, 12)}</strong></div></div>
            <div className="hero-actions face-profile-actions"><a className="outline-btn face-action-primary" href="/game">▶ PLAY FACE64 →</a><button className="outline-btn" type="button" disabled={!statsReady || !art[selected]} onClick={() => void exportPlayerCard()}>↓ SHARE PLAYER CARD</button><button type="button" className="outline-btn" onClick={() => setWalletOpen(v => !v)}>{walletOpen ? "− CLOSE WALLET" : "+ MANAGE WALLET"}</button></div>
            <div className="face-profile-stats"><div><span>RANKED PLAYS</span><strong>{statsReady ? gameStats.plays : "…"}</strong></div><div><span>TOURNAMENT WINS</span><strong>{statsReady ? gameStats.wins : "…"}</strong></div><small>LAST {scanDays} DAYS · ON-CHAIN SUBMITTED SCORES / FINALIZED WINS</small></div>
            <div className="face-profile-rewards"><div className="face-profile-reward-heading"><strong>TOURNAMENT PRIZES</strong><div><button type="button" className={`outline-btn ${scanDays === 30 ? "face-action-primary" : ""}`} onClick={() => setScanDays(30)}>30D</button><button type="button" className={`outline-btn ${scanDays === 90 ? "face-action-primary" : ""}`} onClick={() => setScanDays(90)}>90D</button></div></div>
              {prizes.length === 0 ? <p className="status">NO FINALIZED WINNING PRIZES FOUND IN THIS PERIOD.</p> : prizes.map(prize => <div key={prize.day} className="face-profile-prize"><span>{formatUnits(prize.amount, 18)} OCH <small>· {new Date(prize.day * DAY).toISOString().slice(0, 10)}</small></span>{prize.claimable ? <button type="button" className="outline-btn face-action-primary" disabled={busy} onClick={() => void claim(prize.day)}>CLAIM →</button> : <span>CLAIMED ✓</span>}</div>)}
            </div>
            {walletOpen && <div className="face-profile-wallet"><p className="kicker">TOKEN-BOUND WALLET</p><div className="face-profile-address">{tba ?? "LOADING..."}</div>{tba && <a href={`https://robin.etherscan.io/address/${tba}`} target="_blank" rel="noreferrer">VIEW ON EXPLORER ↗</a>}
              {!deployed && tba && <div><p className="status">DEPLOY THIS ACCOUNT BEFORE SENDING OCH. PRIZES CAN ARRIVE BEFORE DEPLOYMENT.</p><button type="button" className="outline-btn" disabled={busy} onClick={() => void deployAccount()}>DEPLOY FACE WALLET →</button></div>}
              <p>SEND OCH TO YOUR CONNECTED WALLET</p><input className="face-profile-input" value={wallet ?? ""} readOnly aria-label="Receiving wallet"/><input className="face-profile-input" value={amount} onChange={e => setAmount(e.target.value)} placeholder="OCH amount" aria-label="OCH amount"/><button className="outline-btn face-action-primary" type="button" disabled={busy || !tba || !deployed} onClick={() => void transfer()}>SEND OCH →</button>
            </div>}
          </div>
        </div>}
      </>}
      <p className="status" role="status">{busy ? "LOADING / WAITING FOR WALLET… " : ""}{message}</p>
    </section>
  );
}
