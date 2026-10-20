"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createPublicClient, createWalletClient, custom, http, parseAbi, parseUnits } from "viem";
import "./game.css";
const styles = {page:"f64-page", header:"f64-header", brand:"f64-brand", shell:"f64-shell", intro:"f64-intro", eyebrow:"f64-eyebrow", dot:"f64-dot", layout:"f64-layout", machine:"f64-machine", hud:"f64-hud", frame:"f64-frame", board:"f64-board", cell:"f64-cell", readout:"f64-readout", stats:"f64-stats", position:"f64-position", controls:"f64-controls", hint:"f64-hint", error:"f64-error", sessionNote:"f64-sessionNote", identity:"f64-identity", wideButton:"f64-wideButton", side:"f64-side", panel:"f64-panel", panelTitle:"f64-panelTitle", rounds:"f64-rounds", highlight:"f64-highlight", small:"f64-small", row:"f64-row", disclaimer:"f64-disclaimer", timer:"f64-timer", status:"f64-status"} as const;

const API = "https://api.onchainhoodies.xyz/v1/face64/ranked";
const TOURNAMENT = "0x753aa3bFd757D62e69389D90359bCB0c315b7c38" as const;
const OCH = "0x8BDD5adFF8A9D08372323d5BAF5e8e52605AF983" as const;
const FACES = "0xc8e36ae47246e5943da2b228fbaff1fb27a473b0" as const;
const HOODIES = "0x9ec6c5b9f572a9b02138e553bc5f5882da735f45" as const;
const publicRpc = createPublicClient({ transport:http("https://rpc.mainnet.chain.robinhood.com") });
const ABI = parseAbi([
 "function entryFee() view returns (uint256)",
 "function tournaments(uint256 day) view returns (uint32 entrants,uint32 results,uint32 winnerCount,uint256 pool,uint256 lockedFee,bool configLocked,bool finalized,bool refundAll,address winningCollection,uint256 winningTokenId,uint256 winningScore)",
 "function paidEnabled() view returns (bool)",
 "function entriesPaused() view returns (bool)",
 "function getEntry(uint256 day,address collection,uint256 tokenId) view returns ((address payer,bool joined,bool resultSubmitted,bool refundClaimed,bool prizeClaimed,uint256 score,bytes32 gameId))",
 "function enter(address collection,uint256 tokenId)",
 "function submitResult(uint256 day,address collection,uint256 tokenId,uint256 score,bytes32 gameId,uint256 deadline,bytes signature)",
 "function ownerOf(uint256 tokenId) view returns (address)",
 "function allowance(address owner,address spender) view returns (uint256)",
 "function approve(address spender,uint256 amount) returns (bool)"
]);
const network = { id:4663, name:"Robinhood Chain", nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18}, rpcUrls:{default:{http:["https://rpc.mainnet.chain.robinhood.com"]}} } as const;
type EthereumProvider = { request(args:{method:string;params?:unknown[]}):Promise<unknown> };
function injected():EthereumProvider|null { return typeof window!=="undefined" ? ((window as Window & {ethereum?:EthereumProvider}).ethereum??null) : null; }
function nftAddress(c:Identity) { return c==="face"?FACES:HOODIES; }
function utcDayNumber() { return BigInt(Math.floor(Date.now()/86400000)); }

const GREEN = "#CCFF00";
const BLACK = "#000000";
const N = 64;
type Identity = "face" | "hoodie";
type Outcome = { start: number; steps: number; landing: number; hit: boolean; earned: number };
type State = { round: number; phase: "ready" | "decision" | "finished"; rows: number[]; faceId: number; hits: number; roundPoints: number; totalPoints: number; lastOutcome: Outcome | null };
type Session = { ranked?:boolean; paid?:boolean; sessionId: string; day: string; identity: {collection: Identity;tokenId:number}; status: "playing"|"finished"|"timed_out"|"closed"; state: State; inactivityDeadline: number; dayEnd: number; version: number; sessionToken?: string; prototype: boolean };
type Daily = {day:string; faceIds:number[]; rounds:number; entryCutoff:string; tournamentEnd:string};
type LiveSession = { sessionId:string; collection:Identity; tokenId:number; status:string; state:State; lastActionAt:number };
type Entry = {sessionId:string; collection:Identity;tokenId:number;score:number;status:string};
type Artwork = { rows:number[]; foreground?:string; background?:string };
function timeLeft(ms:number):string { const seconds=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`; }
function dayClock(ms:number):string { const s=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor(s%3600/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; }
const pathIndex = (step: number) => { const pos = ((step % N) + N) % N; const y = Math.floor(pos / 8); return y * 8 + (y % 2 === 0 ? pos % 8 : 7 - pos % 8); };
const lit = (rows:number[], index:number) => ((rows[Math.floor(index/8)] ?? 0) & (128 >> (index % 8))) !== 0;
const stepsPath = (start:number,steps:number) => Array.from({length:steps},(_,i)=>pathIndex(start+i+1));
function sleep(ms:number):Promise<void>{ return new Promise(resolve=>window.setTimeout(resolve,ms)); }
async function readJSON<T>(url:string, init?:RequestInit):Promise<T> {
  const response=await fetch(url,{cache:"no-store", ...init});
  const value=await response.json().catch(()=>({error:`HTTP ${response.status}`})) as T & {error?:string};
  if(!response.ok)throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}
const defaultState:State = {round:0,phase:"ready",rows:[],faceId:0,hits:0,roundPoints:0,totalPoints:0,lastOutcome:null};

// Tiny 5x7 bitmap font. Each 5-bit row is read from left to right.
// These pixels are displayed by the same 8x8 grid as the Face artwork.
const PIXEL_FONT: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  A: [14, 17, 17, 31, 17, 17, 17],
  E: [31, 16, 16, 30, 16, 16, 31],
  G: [14, 17, 16, 23, 17, 17, 14],
  M: [17, 27, 21, 21, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  V: [17, 17, 17, 17, 17, 10, 4],
};

function pixelTextRows(text: string, offset: number): number[] {
  const rows = Array<number>(8).fill(0);
  for (let i = 0; i < text.length; i++) {
    const glyph = PIXEL_FONT[text[i].toUpperCase()] ?? PIXEL_FONT[" "];
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 5; x++) {
        if ((glyph[y] & (1 << (4 - x))) === 0) continue;
        const screenX = offset + i * 6 + x;
        if (screenX >= 0 && screenX < 8) rows[y] |= 1 << (7 - screenX);
      }
    }
  }
  return rows;
}


export default function GamePage(){
  type Screen = "welcome" | "collection" | "player" | "mode" | "entry" | "game" | "result" | "leaderboard" | "watch";
  type Mode = "free" | "ranked";
  type OwnedToken = { tokenId:number; image?:string; name?:string };
  const [screen,setScreen]=useState<Screen>("welcome");
  const [mode,setMode]=useState<Mode>("free");
  const [owned,setOwned]=useState<OwnedToken[]>([]);
  const [ownedLoading,setOwnedLoading]=useState(false);
  const [selectedImage,setSelectedImage]=useState<string|null>(null);
  const [tournamentInfo,setTournamentInfo]=useState<{entrants:number;pool:string;fee:string}|null>(null);
  const [daily,setDaily]=useState<Daily|null>(null);
  const [preview,setPreview]=useState<Artwork|null>(null);
  const [now,setNow]=useState(0);
  const [session,setSession]=useState<Session|null>(null);
  const [collection,setCollection]=useState<Identity>("face");
  const [tokenId,setTokenId]=useState(2);
  const [start,setStart]=useState(0);
  const [position,setPosition]=useState<number|null>(null);
  const [animation,setAnimation]=useState(false);
  const [message,setMessage]=useState("SELECT A START POSITION");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [spectating,setSpectating]=useState(false);
  const [live,setLive]=useState<LiveSession[]>([]);
  const [leaders,setLeaders]=useState<Entry[]>([]);
  const [scrollOffset,setScrollOffset]=useState(8);
  const [wallet,setWallet]=useState<`0x${string}`|null>(null);
  const [entered,setEntered]=useState(false);
  const [fee,setFee]=useState<bigint>(parseUnits("100",18));
  const [allowance,setAllowance]=useState<bigint>(BigInt(0));
  const [walletStatus,setWalletStatus]=useState("CONNECT WALLET TO ENTER");
  const [scoreSubmitted,setScoreSubmitted]=useState(false);
  const mounted=useRef(true);
  const busyRef=useRef(false);
  const tokenRef=useRef("");
  const sessionRef=useRef<Session|null>(null);
  const spectatorRef=useRef(false);
  const current= session?.state ?? defaultState;
  const displayRows=session?.state.rows?.length===8?session.state.rows:(preview?.rows ?? []);
  const initialPreview=!session&&!!preview;
  const previewFg=initialPreview?(preview?.foreground??GREEN):GREEN;
  const previewBg=initialPreview?(preview?.background??BLACK):BLACK;
  const isDone= !!session && session.status!=="playing";
  const gameReady=!!session && session.status==="playing";
  const decision=gameReady && current.phase==="decision";
  const count=displayRows.reduce((sum,row)=>sum+row.toString(2).replace(/0/g,"").length,0);
  // Every possible outcome of the original RF64 7–13 step braking range.
  const possibleLandings=Array.from({length:7},(_,i)=>pathIndex(start+7+i));
  const hitCount=possibleLandings.filter(index=>lit(displayRows,index)).length;
  const probability=Math.round(hitCount/7*100);
  const showOdds=!!session && gameReady && !spectating && !animation && current.phase!=="finished";
  // Do not present completed or abandoned sessions as live just because the
  // backend has not yet updated their persisted status.
  const activeLive=live.filter(item=>
    item.status==="playing" &&
    typeof item.lastActionAt==="number" &&
    now>0 &&
    now-item.lastActionAt>=0 &&
    now-item.lastActionAt<4*60*1000 &&
    (!daily || now<Date.parse(daily.tournamentEnd))
  );
  const attractMode = !session && !spectating;
  const gameOverMode = !!session && !spectating && (isDone || current.phase==="finished");
  const showPixelMessage = attractMode || gameOverMode;
  const attractText = gameOverMode ? "GAME OVER" : "START GAME";
  const screenRows = showPixelMessage
    ? pixelTextRows(attractText, scrollOffset)
    : displayRows;

  useEffect(() => {
    if (!showPixelMessage) return;
    const totalWidth = attractText.length * 6;
    const timer = window.setInterval(() => {
      setScrollOffset(value => value < -totalWidth ? 8 : value - 1);
    }, 115);
    return () => window.clearInterval(timer);
  }, [showPixelMessage, attractText]);

  const syncPublic=useCallback(async(id:string,kind?:Mode)=>{
    const actual=kind??(spectatorRef.current?"ranked":(window.sessionStorage.getItem("face64-flow-mode")==="free"?"free":"ranked"));
    const fresh=await readJSON<Session>(`${actual==="free"?"https://api.onchainhoodies.xyz/v1/face64/demo":API}/sessions/${id}`);
    if(mounted.current){
      setSession(fresh);sessionRef.current=fresh;setCollection(fresh.identity.collection);setTokenId(fresh.identity.tokenId);
      if(!spectatorRef.current && (fresh.status!=="playing"||fresh.state.phase==="finished"))setScreen("result");
    }
  },[]);

  useEffect(()=>{
    mounted.current=true;
    const provider=injected();
    if(provider) void provider.request({method:"eth_accounts"}).then(result=>{
      if(Array.isArray(result)&&typeof result[0]==="string")setWallet(result[0] as `0x${string}`);
    }).catch(()=>{});
    const params=new URLSearchParams(window.location.search);
    const watchId=params.get("watch");
    const restoredMode=window.sessionStorage.getItem("face64-flow-mode")==="free"?"free":"ranked";
    const storedId=window.sessionStorage.getItem(restoredMode==="free"?"face64-demo-id":"face64-ranked-id");
    const storedToken=window.sessionStorage.getItem(restoredMode==="free"?"face64-demo-token":"face64-ranked-token");

    // Defer React state changes to an async callback instead of setting state in the effect body.
    // The URL watch parameter takes precedence over a saved player session.
    if(watchId && /^[a-f\d-]{36}$/i.test(watchId)){
      spectatorRef.current=true;
      void Promise.resolve().then(()=>{
        if(!mounted.current)return;
        setSpectating(true);setScreen("watch");
        return syncPublic(watchId,"ranked").catch(err=>setError(String(err)));
      });
    }else if(storedId && storedToken){
      tokenRef.current=storedToken;
      void Promise.resolve().then(()=>{
        if(!mounted.current)return;
        setMode(restoredMode);setScreen("game");
        return syncPublic(storedId,restoredMode).catch(()=>{
          window.sessionStorage.removeItem(restoredMode==="free"?"face64-demo-id":"face64-ranked-id");
          window.sessionStorage.removeItem(restoredMode==="free"?"face64-demo-token":"face64-ranked-token");
        });
      });
    }
    void readJSON<Daily>(`${API}/daily`).then(setDaily).catch(err=>setError(err instanceof Error?err.message:"Could not load daily challenge"));
    return ()=>{mounted.current=false;};
  },[syncPublic]);

  useEffect(()=>{
    const first=window.setTimeout(()=>setNow(Date.now()),0);
    const id=window.setInterval(()=>setNow(Date.now()),1000);
    return ()=>{window.clearTimeout(first);window.clearInterval(id);};
  },[]);

  const previewFaceId=daily?.faceIds?.[0];
  useEffect(()=>{
    const id=previewFaceId;
    if(!id)return;
    // Preview uses the site's existing public Face endpoint; no player session needed.
    void readJSON<Artwork>(`/api/face/${id}`).then(value=>{if(value.rows?.length===8)setPreview(value);}).catch(()=>{});
  },[previewFaceId]);

  useEffect(()=>{
    if(!spectating || !session?.sessionId) return;
    const id=window.setInterval(()=>void syncPublic(session.sessionId).catch(()=>{}),2000);
    return ()=>window.clearInterval(id);
  },[spectating,session?.sessionId,syncPublic]);

  useEffect(()=>{
    const update=async()=>{
      try{
        const [a,b]=await Promise.all([readJSON<{sessions:LiveSession[]}>(`${API}/live`),readJSON<{entries:Entry[]}>(`${API}/leaderboard`)]);
        if(mounted.current){setLive(a.sessions);setLeaders(b.entries);}
      }catch{/* Keep game playable if spectator feed is unavailable. */}
    };
    void update();const id=window.setInterval(()=>void update(),12000);
    return ()=>window.clearInterval(id);
  },[]);

  const refreshEntry=useCallback(async(walletAddress:`0x${string}`,c:Identity,id:number)=>{
    if(!Number.isInteger(id)||id<(c==="face"?1:0))return;
    const nft=nftAddress(c);
    const [entry,entryFee,enabled,paused,approved] = await Promise.all([
      (injected()?createPublicClient({transport:custom(injected()!)}):publicRpc).readContract({address:TOURNAMENT,abi:ABI,functionName:"getEntry",args:[utcDayNumber(),nft,BigInt(id)]}),
      (injected()?createPublicClient({transport:custom(injected()!)}):publicRpc).readContract({address:TOURNAMENT,abi:ABI,functionName:"entryFee"}),
      (injected()?createPublicClient({transport:custom(injected()!)}):publicRpc).readContract({address:TOURNAMENT,abi:ABI,functionName:"paidEnabled"}),
      (injected()?createPublicClient({transport:custom(injected()!)}):publicRpc).readContract({address:TOURNAMENT,abi:ABI,functionName:"entriesPaused"}),
      (injected()?createPublicClient({transport:custom(injected()!)}):publicRpc).readContract({address:OCH,abi:ABI,functionName:"allowance",args:[walletAddress,TOURNAMENT]})
    ]);
    setEntered(entry.joined);if(entry.resultSubmitted)setScoreSubmitted(true);setFee(enabled?entryFee:BigInt(0));setAllowance(approved);
    setWalletStatus(paused?"ENTRIES PAUSED":entry.joined?"ENTRY CONFIRMED":`ENTRY FEE ${Number(entryFee)/1e18} OCH`);
  },[]);
  useEffect(()=>{
    if(!wallet||spectating||mode!=="ranked"||(screen!=="entry"&&screen!=="result"))return;
    // RPC-driven state updates happen after the asynchronous read completes.
    void Promise.resolve().then(()=>refreshEntry(wallet,collection,tokenId)).catch(e=>setError(String(e)));
  },[wallet,collection,tokenId,spectating,refreshEntry,mode,screen]);
  const walletClient=()=>{
    const provider=injected();if(!provider||!wallet)throw new Error("Connect an injected wallet first");
    return createWalletClient({account:wallet,chain:network,transport:custom(provider)});
  };
  const connectWallet=async()=>{
    const provider=injected();if(!provider)throw new Error("No injected wallet found. Install a wallet extension.");
    const accounts=await provider.request({method:"eth_requestAccounts"});
    if(!Array.isArray(accounts)||typeof accounts[0]!=="string")throw new Error("Wallet connection was cancelled");
    const chain=await provider.request({method:"eth_chainId"});
    if(chain!=="0x1237") { // 4663 hex = 0x1237
      try{await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x1237"}]});}
      catch(e){throw new Error("Please switch your wallet to Robinhood Chain (4663): "+String(e));}
    }
    setWallet(accounts[0] as `0x${string}`);
    setMessage("WALLET CONNECTED");
  };
  const payEntry=async()=>{
    if(!wallet)throw new Error("Connect wallet first");
    const nft=nftAddress(collection);
    const owner=await (injected()?createPublicClient({transport:custom(injected()!)}):publicRpc).readContract({address:nft,abi:ABI,functionName:"ownerOf",args:[BigInt(tokenId)]});
    if(owner.toLowerCase()!==wallet.toLowerCase())throw new Error("Connected wallet is not the current NFT owner. TBA/delegation entry is not yet in this browser flow.");
    const client=walletClient();
    if(allowance<fee){
      setWalletStatus("APPROVE OCH IN WALLET");
      const hash=await client.writeContract({address:OCH,abi:ABI,functionName:"approve",args:[TOURNAMENT,fee]});
      const receipt=await (injected()?createPublicClient({transport:custom(injected()!)}):publicRpc).waitForTransactionReceipt({hash});if(receipt.status!=="success")throw new Error("OCH approval reverted");
      await refreshEntry(wallet,collection,tokenId);
      setMessage("APPROVED · CLICK ENTER AGAIN");return;
    }
    setWalletStatus("CONFIRM ENTRY IN WALLET");
    const hash=await client.writeContract({address:TOURNAMENT,abi:ABI,functionName:"enter",args:[nft,BigInt(tokenId)]});
    const receipt=await (injected()?createPublicClient({transport:custom(injected()!)}):publicRpc).waitForTransactionReceipt({hash});if(receipt.status!=="success")throw new Error("Tournament entry reverted");
    await refreshEntry(wallet,collection,tokenId);
    setMessage("ENTRY CONFIRMED · START GAME");
  };
  const submitScore=async()=>{
    if(!session||!wallet)throw new Error("A connected wallet and completed session are required");
    const signed=await readJSON<{day:string;collection:`0x${string}`;tokenId:number;score:string;gameId:`0x${string}`;deadline:string;signature:`0x${string}`}>(`${API}/sessions/${session.sessionId}/result`,{
      method:"POST",headers:{authorization:`Bearer ${tokenRef.current}`,"content-type":"application/json"},body:"{}"
    });
    const client=walletClient();setWalletStatus("CONFIRM SCORE TRANSACTION");
    const hash=await client.writeContract({address:TOURNAMENT,abi:ABI,functionName:"submitResult",args:[BigInt(signed.day),signed.collection,BigInt(signed.tokenId),BigInt(signed.score),signed.gameId,BigInt(signed.deadline),signed.signature]});
    const receipt=await (injected()?createPublicClient({transport:custom(injected()!)}):publicRpc).waitForTransactionReceipt({hash});if(receipt.status!=="success")throw new Error("Result transaction reverted");
    setScoreSubmitted(true);setWalletStatus("SCORE RECORDED ON CHAIN");setMessage("SCORE RECORDED ON CHAIN");
  };
  const beginRanked=async()=>{
    if(!wallet){await connectWallet();return;}
    if(!entered){await payEntry();return;}
    await makeSession();
  };
  const makeSession=async()=>{
    if(busyRef.current)return;
    busyRef.current=true;setBusy(true);setError("");
    try{
      if(!wallet)throw new Error("Connect wallet first");
      const challenge=await readJSON<{nonce:string;message:string}>(`${API}/challenge`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({collection,tokenId,wallet})});
      const signature=await walletClient().signMessage({message:challenge.message});
      const created=await readJSON<Session>(`${API}/sessions`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({wallet,nonce:challenge.nonce,signature})});
      const secret=created.sessionToken;
      if(!secret)throw new Error("Session token missing");
      tokenRef.current=secret;
      sessionRef.current=created;setSession(created);setStart(0);setPosition(null);
      window.sessionStorage.setItem("face64-flow-mode","ranked");
      window.sessionStorage.setItem("face64-ranked-id",created.sessionId);
      window.sessionStorage.setItem("face64-ranked-token",secret);
      setMessage("CHOOSE POSITION · RUN TO SPIN");
      setScreen("game");
      window.history.replaceState({},"", "/game");
    }catch(e){setError(e instanceof Error?e.message:"Could not start game");}
    finally{busyRef.current=false;setBusy(false);}
  };
  const makeFreeSession=async()=>{
    if(busyRef.current)return;
    busyRef.current=true;setBusy(true);setError("");
    try{
      const created=await readJSON<Session>("https://api.onchainhoodies.xyz/v1/face64/demo/sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({collection,tokenId})});
      if(!created.sessionToken)throw new Error("Practice session token missing");
      tokenRef.current=created.sessionToken;
      sessionRef.current=created;setSession(created);setPosition(null);setStart(0);setMode("free");
      window.sessionStorage.setItem("face64-flow-mode","free");
      window.sessionStorage.setItem("face64-demo-id",created.sessionId);
      window.sessionStorage.setItem("face64-demo-token",created.sessionToken);
      setMessage("CHOOSE START PIXEL · RUN");setScreen("game");
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{busyRef.current=false;setBusy(false);}
  };
  // NFT discovery is an optional server-side endpoint; never expose the Alchemy key in the browser.
  // Manual token-ID entry remains available if discovery is not configured.
  useEffect(()=>{
    if(screen!=="player"||!wallet){return;}
    let cancelled=false;
    void Promise.resolve().then(()=>{if(!cancelled){setOwnedLoading(true);setOwned([]);}});
    void readJSON<{tokens:OwnedToken[]}>(`https://api.onchainhoodies.xyz/v1/face64/ranked/nfts?owner=${encodeURIComponent(wallet)}&collection=${collection}`)
      .then(data=>{if(!cancelled)setOwned((data.tokens||[]).filter(t=>Number.isInteger(t.tokenId)));})
      .catch(()=>{if(!cancelled)setOwned([]);})
      .finally(()=>{if(!cancelled)setOwnedLoading(false);});
    return ()=>{cancelled=true;};
  },[screen,wallet,collection]);
  const choosePlayer=(id:number,img?:string)=>{setTokenId(id);setEntered(false);setSelectedImage(img||null);setScreen("mode");setError("");};
  const resetFlow=()=>{
    // Do not delete an active paid session when the player visits the home screen.
    // It can be resumed until its four-minute inactivity deadline.
    if(!spectatorRef.current&&sessionRef.current?.status==="playing"){
      setScreen("welcome");setError("");return;
    }
    spectatorRef.current=false;setSpectating(false);setSession(null);sessionRef.current=null;
    tokenRef.current="";setScoreSubmitted(false);setPosition(null);setStart(0);
    setError("");setScreen("welcome");
    window.sessionStorage.removeItem("face64-ranked-id");window.sessionStorage.removeItem("face64-ranked-token");
    window.sessionStorage.removeItem("face64-demo-id");window.sessionStorage.removeItem("face64-demo-token");
    window.history.replaceState({},"","/game");
  };
  const bank=async()=>{
    if(!gameReady||current.phase!=="decision"||spectating||animation||busyRef.current)return;
    await performAction("bank");
  };
  const animate=async(outcome:Outcome)=>{
    // Server has already decided and saved the landing; animation never picks a result.
    const path=stepsPath(outcome.start,outcome.steps);
    setAnimation(true);setMessage("ROULETTE · BRAKING…");
    for(let i=0;i<path.length;i++){
      if(!mounted.current)break;
      setPosition(path[i]);
      const progress=(i+1)/path.length;
      await sleep(Math.round(115+235*progress*progress));
    }
    if(mounted.current){setMessage(outcome.hit?`HIT +${outcome.earned} · PIXEL REMOVED`:"MISS · ROUND OVER");setAnimation(false);}
  };
  const move=()=>{
    if(busyRef.current||animation||spectating||!gameReady)return;
    // The server still owns decision state: moving NEVER mutates phase or disables BANK.
    setStart(v=>(v+1)%64);setPosition(null);
  };
  const performAction=async(verb:"run"|"bank")=>{
    if(busyRef.current||animation||spectating||!gameReady)return;
    const existing=sessionRef.current??session;
    if(!existing||!tokenRef.current)return;
    if(verb==="bank"&&existing.state.phase!=="decision")return;
    busyRef.current=true;setBusy(true);setError("");
    try{
      const base=mode==="free"?"https://api.onchainhoodies.xyz/v1/face64/demo":API;
      const result=await readJSON<{session:Session;startPosition?:number;steps?:number;landing?:number;hit?:boolean;earned?:number;banked?:number}>(`${base}/sessions/${existing.sessionId}/${verb}`,{
        method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${tokenRef.current}`},
        body:JSON.stringify(verb==="run"?{startPosition:start}:{})
      });
      if(verb==="run"&&result.startPosition!==undefined&&result.steps!==undefined&&result.landing!==undefined){
        await animate({start:result.startPosition,steps:result.steps,landing:result.landing,hit:!!result.hit,earned:result.earned??0});
      }else setMessage(`BANKED ${result.banked??0} POINTS`);
      sessionRef.current=result.session;setSession(result.session);setPosition(null);
      if(result.session.status!=="playing"||result.session.state.phase==="finished"){
        setMessage(`GAME OVER · ${result.session.state.totalPoints} POINTS`);setScreen("result");
      }else if(result.session.state.phase==="ready"&&verb==="run")setMessage(result.hit?"NEXT ROUND":"MISS · NEXT ROUND");
    }catch(e){setError(e instanceof Error?e.message:"Could not submit action");try{await syncPublic(existing.sessionId);}catch{}}
    finally{busyRef.current=false;setBusy(false);}
  };
  const action=async()=>{await performAction("run");};
  const holdTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const holdRepeat=useRef<ReturnType<typeof setInterval>|null>(null);
  const stopHold=()=>{
    if(holdTimer.current){clearTimeout(holdTimer.current);holdTimer.current=null;}
    if(holdRepeat.current){clearInterval(holdRepeat.current);holdRepeat.current=null;}
  };
  const startHold=()=>{
    if(!gameReady||busy||animation)return;
    move();stopHold();
    holdTimer.current=setTimeout(()=>{holdRepeat.current=setInterval(()=>moveRef.current(),135);},340);
  };
  useEffect(()=>()=>{
    if(holdTimer.current)clearTimeout(holdTimer.current);
    if(holdRepeat.current)clearInterval(holdRepeat.current);
  },[]);
  useEffect(()=>{
    if(screen!=="mode"&&screen!=="entry")return;
    let cancelled=false;
    void readJSON<{entrants:number;pool:string;fee:string}>(`${API}/tournament`)
      .then(v=>{if(!cancelled){setTournamentInfo(v);setFee(BigInt(v.fee));}}).catch(()=>{});
    return ()=>{cancelled=true;};
  },[screen]);
  const watch=(id:string)=>{
    spectatorRef.current=true;setSpectating(true);setScreen("watch");setMode("ranked");setPosition(null);setMessage("WATCHING LIVE GAME");
    window.history.replaceState({},"",`/game?watch=${encodeURIComponent(id)}`);
    void syncPublic(id,"ranked").catch(e=>setError(String(e)));
  };
  const backToPlayer=()=>{
    spectatorRef.current=false;setSpectating(false);setSession(null);sessionRef.current=null;setPosition(null);setScreen("welcome");
    window.history.replaceState({},"","/game");
    const id=window.sessionStorage.getItem("face64-ranked-id");
    if(id){setMode("ranked");tokenRef.current=window.sessionStorage.getItem("face64-ranked-token")||"";setScreen("game");void syncPublic(id,"ranked").catch(()=>{});}
  };
  const visiblePosition=position===null?pathIndex(start):position;
  // Preserve Space/Enter as actual buttons; never hijack typing in the identity fields.
  const moveRef=useRef<() => void>(()=>{});
  const actionRef=useRef<() => Promise<void>>(async()=>{});
  const bankRef=useRef<() => Promise<void>>(async()=>{});
  useEffect(()=>{
    moveRef.current=move;
    actionRef.current=action;
    bankRef.current=bank;
  });
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.altKey||e.ctrlKey||e.metaKey||screen!=="game")return;
      const el=e.target as HTMLElement|null;
      if(el && (el.tagName==="INPUT"||el.tagName==="SELECT"||el.tagName==="TEXTAREA"||el.isContentEditable))return;
      if(e.code==="Space"){e.preventDefault();moveRef.current();}
      if(e.code==="Enter"&&!e.repeat){e.preventDefault();void actionRef.current();}
      if((e.code==="KeyB"||e.code==="Backspace")&&!e.repeat){e.preventDefault();void bankRef.current();}
    };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[screen]);
  const deadline=session?.status==="playing"?Math.min(session.inactivityDeadline,session.dayEnd):null;
  const remaining=deadline && now?Math.max(0,deadline-now):null;
  const dailyRemaining=daily&&now?Math.max(0,Date.parse(daily.tournamentEnd)-now):null;
  const displayName=(kind:Identity,id:number)=>`${kind==="face"?"FACE":"HOODIE"} #${id}`;
  const gameBoard=<>
    <div className={styles.hud}><span>{spectating?"WATCH LIVE":`ROUND ${session?Math.min(current.round+1,8):1} / 8`}</span><span>FACE #{current.faceId||daily?.faceIds?.[0]||"—"}</span></div>
    <div className="f64-playing">{session?displayName(session.identity.collection,session.identity.tokenId):displayName(collection,tokenId)} · {mode==="free"?"FREE":"TOURNAMENT"}</div>
    <div className={styles.timer}><span>SESSION <strong>{remaining!==null?timeLeft(remaining):"04:00"}</strong></span><span>DAILY <strong>{dailyRemaining!==null?dayClock(dailyRemaining):"--:--"}</strong></span></div>
    <div className={`${styles.frame} f64-game-display`}>
      <div className={styles.board} role="img" aria-label={`FACE64 LED; ${count} lit pixels`}>
        {Array.from({length:N},(_,index)=>{
          const active=lit(screenRows,index);
          const cursor=!showPixelMessage&&!!session&&visiblePosition===index&&current.phase!=="finished";
          const potential=!showPixelMessage&&showOdds&&possibleLandings.includes(index);
          return <div className={`${styles.cell}${potential?(active?" f64-possible-hit":" f64-possible-miss"):""}${cursor?" f64-cursor":""}`} key={index} style={{backgroundColor:showPixelMessage?(active?GREEN:BLACK):(active?previewFg:previewBg),position:"relative",zIndex:cursor?2:potential?1:0}}/>;
        })}
      </div>
    </div>
    <div className="f64-odds"><span>7–13 STEPS</span><strong className="f64-odds-percent">{showOdds?`${probability}%`:"—"}</strong><span>{showOdds?`${hitCount}/7 CHANCES HIT GREEN`:"CHOOSE YOUR START PIXEL"}</span></div>
    <div className="f64-legend"><span><i className="f64-legend-start"/> START</span><span><i className="f64-legend-hit"/> POSSIBLE HIT</span><span><i className="f64-legend-miss"/> POSSIBLE MISS</span></div>
    <div className={styles.readout} aria-live="polite">{busy&&!animation?"LOADING…":message}</div>
    <div className={styles.stats}><span>HITS <strong>{current.hits}</strong></span><span>AT RISK <strong>{current.roundPoints}</strong></span><span>BANKED <strong>{current.totalPoints}</strong></span></div>
  </>;
  return <div className={`${styles.page} f64-flow-page`}>
    <header className={styles.header}><Link href="/" className={styles.brand}>64 FACES</Link><nav><span>FACE64 / ARCADE</span><button className="f64-text-btn" onClick={resetFlow}>HOME ↗</button></nav></header>
    <main className="f64-flow-shell">
      <div className="f64-flow-top"><span>FACE64 / {screen.toUpperCase()}</span><span>8 ROUNDS · 8×8 PIXELS</span></div>
      <section className="f64-flow-card">
        {screen==="welcome"&&<div className="f64-screen f64-center">
          <div className="f64-overline">ON-CHAIN ARCADE / ROBINHOOD CHAIN</div><h1 className="f64-title">FACE64<span>.</span></h1>
          <p className="f64-sub">FIND YOUR PIXEL. RISK THE RUN. BANK THE POINTS.</p>
          <div className="f64-home-led" aria-hidden="true">{Array.from({length:64},(_,i)=><i key={i} className={i%9===0||i%7===0?"on":""}/>)}</div>
          {session?.status==="playing"&&!spectating&&<div className="f64-flow-actions"><button onClick={()=>setScreen("game")}>RESUME MY GAME →</button></div>}
          <div className="f64-flow-actions"><button onClick={()=>{setScreen("collection");setError("");}}>PLAY</button><button className="f64-alt" onClick={()=>setScreen("watch")}>WATCH LIVE {activeLive.length?`(${activeLive.length})`:""}</button></div>
          <p className="f64-flow-note">PRACTICE FREE OR ENTER A DAILY OCH TOURNAMENT</p>
        </div>}
        {screen==="collection"&&<div className="f64-screen"><h2>CHOOSE COLLECTION</h2><p className="f64-sub">WHICH PLAYER WILL ENTER THE ARCADE?</p>
          <div className="f64-choice-grid"><button className="f64-choice" onClick={()=>{setCollection("hoodie");setScreen("player");}}><div className="f64-choice-icon">20×20</div><strong>ONCHAINHOODIE</strong><span>6,000 CITIZENS</span></button>
          <button className="f64-choice" onClick={()=>{setCollection("face");setScreen("player");}}><div className="f64-choice-icon">8×8</div><strong>64 FACE</strong><span>PIXEL ART PLAYER</span></button></div>
          <button className="f64-back" onClick={()=>setScreen("welcome")}>← BACK</button>
        </div>}
        {screen==="player"&&<div className="f64-screen"><h2>SELECT {collection==="face"?"64 FACE":"HOODIE"}</h2><p className="f64-sub">CHOOSE YOUR NFT OR ENTER ITS TOKEN ID.</p>
          <div className="f64-flow-wallet">{wallet?`WALLET ${wallet.slice(0,6)}…${wallet.slice(-4)}`:"WALLET NOT CONNECTED"} <button onClick={()=>void connectWallet().catch(e=>setError(String(e)))}>{wallet?"CHANGE":"CONNECT"}</button></div>
          {ownedLoading&&<p className="f64-sub">LOOKING FOR YOUR NFTS…</p>}
          {owned.length>0&&<div className="f64-token-grid">{owned.slice(0,100).map(t=><button key={t.tokenId} className="f64-token-card" onClick={()=>choosePlayer(t.tokenId,t.image)}>{t.image?<Image unoptimized width={100} height={100} src={t.image} alt={t.name||displayName(collection,t.tokenId)}/>:<div className="f64-token-fallback">{collection==="face"?"8×8":"20×20"}</div>}<span>#{t.tokenId}</span></button>)}</div>}
          <div className="f64-manual"><label htmlFor="f64-id">TOKEN ID</label><input id="f64-id" type="number" value={tokenId} min={collection==="face"?1:0} max={collection==="face"?512:5999} onChange={e=>setTokenId(Number(e.target.value))}/><button onClick={()=>{if(Number.isInteger(tokenId)&&tokenId>=(collection==="face"?1:0)&&tokenId<=(collection==="face"?512:5999))choosePlayer(tokenId);else setError("Invalid token ID");}}>SELECT →</button></div>
          <p className="f64-flow-note">FREE MODE CAN USE ANY VALID TOKEN ID. TOURNAMENT MODE REQUIRES OWNERSHIP.</p>
          <button className="f64-back" onClick={()=>setScreen("collection")}>← BACK</button>
        </div>}
        {screen==="mode"&&<div className="f64-screen"><h2>CHOOSE YOUR MODE</h2><p className="f64-sub">{displayName(collection,tokenId)} IS READY.</p>
          <div className="f64-choice-grid"><button className="f64-choice" onClick={()=>{setMode("free");setScreen("entry");}}><strong>FREE PLAY</strong><b>0 OCH</b><span>PRACTICE ALL 8 ROUNDS · NO PAYOUT</span></button>
          <button className="f64-choice" onClick={()=>{setMode("ranked");setScreen("entry");}}><strong>TOURNAMENT</strong><b>{Number(fee)/1e18} OCH</b><span>DAILY RANKED GAME · WINNERS SHARE THE POOL</span></button></div>
          <p className="f64-flow-note">CURRENT POOL: {tournamentInfo?`${Number(tournamentInfo.pool)/1e18} OCH`:"LOADING…"} · {tournamentInfo?.entrants??"—"} ENTRIES · ENTRY CLOSES {daily?new Date(daily.entryCutoff).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",timeZone:"UTC"}):"23:45"} UTC</p>
          <button className="f64-back" onClick={()=>setScreen("player")}>← CHANGE PLAYER</button>
        </div>}
        {screen==="entry"&&<div className="f64-screen f64-center"><div className="f64-overline">{mode==="free"?"FREE PRACTICE":"DAILY TOURNAMENT"}</div><h2>{displayName(collection,tokenId)}</h2>
          <p className="f64-sub">{mode==="free"?"EIGHT ROUNDS · NO OCH REQUIRED":"ONE ENTRY PER NFT PER DAY · WINNERS SHARE THE PRIZE POOL"}</p>
          {selectedImage&&<Image unoptimized width={110} height={110} className="f64-selected-image" src={selectedImage} alt={displayName(collection,tokenId)}/>}
          <div className="f64-entry-price">{mode==="free"?"FREE":`${Number(fee)/1e18} OCH`}</div>
          {mode==="ranked"&&<p className="f64-sub">CURRENT POOL: {tournamentInfo?`${Number(tournamentInfo.pool)/1e18} OCH`:"—"} · {tournamentInfo?.entrants??"—"} ENTRIES</p>}
          {mode==="ranked"&&<><div className="f64-flow-wallet">{wallet?`${wallet.slice(0,6)}…${wallet.slice(-4)}`:"CONNECT A WALLET TO ENTER"}<button onClick={()=>void connectWallet().catch(e=>setError(String(e)))}>CONNECT</button></div><p className="f64-flow-note">{walletStatus}</p></>}
          <div className="f64-flow-actions"><button disabled={busy} onClick={()=>void (mode==="free"?makeFreeSession():beginRanked()).catch(e=>setError(String(e)))}>{busy?"WAIT…":mode==="free"?"START FREE GAME":!wallet?"CONNECT WALLET":entered?"START TOURNAMENT":allowance<fee?"APPROVE OCH":"ENTER TOURNAMENT"}</button></div>
          <button className="f64-back" onClick={()=>setScreen("mode")}>← BACK TO MODES</button>
        </div>}
        {(screen==="game"||screen==="watch")&&<div className="f64-screen f64-game-screen"><div className="f64-game-center">{gameBoard}</div>
          {screen==="game"&&!spectating?<><div className="f64-controls3">
            <button type="button" disabled={!gameReady||busy||animation} onPointerDown={e=>{e.preventDefault();startHold();}} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}>NEXT PIXEL <small>HOLD TO SCROLL</small></button>
            <button type="button" disabled={!gameReady||busy||animation} onClick={()=>void action()}>RUN <small>↵ ENTER</small></button>
            <button type="button" disabled={!decision||busy||animation} onClick={()=>void bank()}>BANK <small>B KEY</small></button>
          </div><p className="f64-flow-note">SPACE: NEXT PIXEL · ENTER: RUN · B: BANK · {decision?"BANK ANYTIME AFTER A HIT":"CHOOSE YOUR START POSITION"}</p></>:
          <button className="f64-wideButton" onClick={backToPlayer}>← LEAVE SPECTATOR</button>}
          {session&&<p className="f64-flow-note">{session.status==="playing"?"4-MINUTE INACTIVITY LIMIT":"SESSION ENDED"} · {mode==="ranked"?"PAID RANKED":"FREE PRACTICE"}</p>}
        </div>}
        {screen==="result"&&<div className="f64-screen f64-center"><div className="f64-overline">GAME COMPLETE</div><h2>GAME OVER</h2><div className="f64-result-score">{current.totalPoints}<span>POINTS</span></div><p className="f64-sub">{displayName(collection,tokenId)} · 8 ROUNDS</p>
          {mode==="ranked"&&!scoreSubmitted?<><p className="f64-sub">YOUR SCORE MUST BE SUBMITTED ON-CHAIN TO COUNT.</p><div className="f64-flow-actions"><button disabled={busy} onClick={()=>void (async()=>{try{setBusy(true);setError("");await submitScore();}catch(e){setError(String(e));}finally{setBusy(false);}})()}>{busy?"WAITING FOR WALLET…":"SUBMIT SCORE"}</button></div></>:
          <p className="f64-flow-note">{mode==="free"?"PRACTICE SCORE · NOT ON CHAIN":"SCORE RECORDED ON-CHAIN ✓"}</p>}
          <div className="f64-flow-actions"><button className="f64-alt" onClick={()=>setScreen("leaderboard")}>VIEW LEADERBOARD →</button></div>
        </div>}
        {screen==="leaderboard"&&<div className="f64-screen"><h2>DAILY LEADERBOARD</h2><p className="f64-sub">{daily?.day||"TODAY"} · RANKED RESULTS</p>
          <div className="f64-leader-list">{leaders.length?leaders.map((entry,i)=><button key={entry.sessionId} onClick={()=>watch(entry.sessionId)}><span>{String(i+1).padStart(2,"0")}</span><span>{displayName(entry.collection,entry.tokenId)}</span><strong>{entry.score} PTS</strong></button>):<p>NO COMPLETED RANKED GAMES YET.</p>}</div>
          <p className="f64-flow-note">LEADERBOARD SHOWS COMPLETED WORKER SESSIONS. ONLY SUCCESSFULLY SUBMITTED SCORES COUNT ON-CHAIN.</p>
          <div className="f64-flow-actions"><button onClick={resetFlow}>PLAY AGAIN</button><button className="f64-alt" onClick={()=>setScreen("watch")}>WATCH LIVE</button></div>
        </div>}
        {screen==="watch"&&!spectating&&<div className="f64-screen"><h2>WATCH LIVE</h2><p className="f64-sub">ACTIVE DAILY TOURNAMENT GAMES</p>
          <div className="f64-leader-list">{activeLive.length?activeLive.map(item=><button key={item.sessionId} onClick={()=>watch(item.sessionId)}><span>●</span><span>{displayName(item.collection,item.tokenId)} · ROUND {Math.min(item.state.round+1,8)}/8</span><strong>{item.state.totalPoints} PTS</strong></button>):<p>NO LIVE GAMES RIGHT NOW.</p>}</div>
          <div className="f64-flow-actions"><button onClick={()=>setScreen("leaderboard")}>LEADERBOARD</button><button className="f64-alt" onClick={resetFlow}>BACK TO START</button></div>
        </div>}
        {error&&<div className={styles.error} role="alert">{error}</div>}
      </section>
      <p className="f64-flow-footer">FACE64 MAINNET PILOT · CHANCE-BASED SERVER ROULETTE IS NOT INDEPENDENTLY VERIFIABLE · TESTING ONLY</p>
    </main>
  </div>;
}
