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
 "function finalize(uint256 day)",
 "function claimPrize(uint256 day,address collection,uint256 tokenId)",
 "function claimRefund(uint256 day,address collection,uint256 tokenId)",
 "function balanceOf(address owner) view returns (uint256)",
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
// A friendly 8x8 Face while the daily on-chain artwork is loading.
const START_FACE_ROWS = [60, 66, 165, 129, 165, 153, 66, 60];
type Identity = "face" | "hoodie";
type Outcome = { start: number; steps: number; landing: number; hit: boolean; earned: number };
type State = { round: number; phase: "ready" | "decision" | "finished"; rows: number[]; faceId: number; hits: number; roundPoints: number; totalPoints: number; lastOutcome: Outcome | null };
type Session = { ranked?:boolean; paid?:boolean; sessionId: string; day: string; identity: {collection: Identity;tokenId:number}; status: "playing"|"finished"|"timed_out"|"closed"; state: State; inactivityDeadline: number; dayEnd: number; version: number; sessionToken?: string; prototype: boolean; runner?:string|null; strategy?:string|null; verification?:string };
type Daily = {day:string; faceIds:number[]; rounds:number; entryCutoff:string; tournamentEnd:string};
type LiveSession = { sessionId:string; collection:Identity; tokenId:number; status:string; state:State; lastActionAt:number; runner?:string|null; strategy?:string|null };
type Entry = {sessionId:string; collection:Identity;tokenId:number;score:number;status:string;runner?:string|null;strategy?:string|null};
type TournamentInfo = {day:string;entrants:number;results:number;pool:string;fee:string;finalized:boolean;refundAll:boolean;winnerCount:number;winningScore:string;winningCollection:string;winningTokenId:string;endTime:string};
type Artwork = { rows:number[]; foreground?:string; background?:string };
type ReplayEvent = {type:string;payload:Record<string,unknown>;at:number};
type ReplayPayload = {sessionId:string;day:string;faceIds:number[];events:ReplayEvent[];truncated:boolean};
type ReplayFrame = {rows:number[];faceId:number;round:number;totalPoints:number;roundPoints:number;position:number|null;label:string};
function replayFrames(data:ReplayPayload,boards:number[][]):ReplayFrame[]{
  let round=0,totalPoints=0,roundPoints=0;
  let rows=[...(boards[0]||Array<number>(8).fill(0))];
  const frames:ReplayFrame[]=[];
  const add=(label:string,position:number|null=null,repeats=1)=>{
    for(let n=0;n<repeats;n++)frames.push({rows:[...rows],faceId:data.faceIds[Math.min(round,7)]||0,round:Math.min(round,7),totalPoints,roundPoints,position,label});
  };
  add('ROUND 1 · READY',null,8);
  for(const ev of data.events){
    if(ev.type==='run'){
      const start=Number(ev.payload.startPosition),steps=Number(ev.payload.steps),landing=Number(ev.payload.landing);
      if(!Number.isInteger(start)||start<0||start>63||!Number.isInteger(steps)||steps<1||steps>64||!Number.isInteger(landing)||landing<0||landing>63)continue;
      add('RUN · SPINNING',pathIndex(start),4);
      for(let i=1;i<=steps;i++)add('RUN · SPINNING',pathIndex(start+i),i===steps?6:2);
      if(ev.payload.hit===true){
        const earned=Number(ev.payload.earned)||0;
        rows[Math.floor(landing/8)] &= ~(128>>(landing%8));roundPoints+=earned;
        add('HIT +' + earned,landing,10);
        if(rows.every(v=>v===0)){
          totalPoints+=roundPoints;add('AUTO BANK +' + roundPoints,landing,8);
          round++;roundPoints=0;
          if(round<8){rows=[...(boards[round]||Array<number>(8).fill(0))];add('ROUND '+(round+1)+' · READY',null,8);}
        }
      }else{
        add('MISS · ROUND OVER',landing,10);round++;roundPoints=0;
        if(round<8){rows=[...(boards[round]||Array<number>(8).fill(0))];add('ROUND '+(round+1)+' · READY',null,8);}
      }
    }else if(ev.type==='bank'){
      totalPoints+=roundPoints;
      add('BANKED '+roundPoints+' POINTS',null,10);
      round++;roundPoints=0;
      if(round<8){rows=[...(boards[round]||Array<number>(8).fill(0))];add('ROUND '+(round+1)+' · READY',null,8);}
    }
  }
  add('REPLAY COMPLETE · '+totalPoints+' POINTS',null,18);
  return frames;
}
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


// Reproduce the ranked/demo daily board selection for archival leaderboard cards.
async function dailyFaceIds(day: string): Promise<number[]> {
  const digest = async (input: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  const hex = (data: Uint8Array) => Array.from(data, v => v.toString(16).padStart(2, "0")).join("");
  const seed = hex(await digest(`FACE64-V1-CHALLENGE|4663|${day}`));
  const numbers: number[] = [];
  const addNumbers = (bytes: Uint8Array) => {
    for (let i=0;i<bytes.length;i+=4) numbers.push((bytes[i]*16777216+(bytes[i+1]<<16)+(bytes[i+2]<<8)+bytes[i+3])>>>0);
  };
  addNumbers(await digest(`${seed}|boards`));
  const ids: number[] = [];
  let n=0;
  while(ids.length<8){
    if(n>=numbers.length) addNumbers(await digest(`${seed}|${n}`));
    const id=(numbers[n++]%229)+1;
    if(!ids.includes(id)) ids.push(id);
  }
  return ids;
}
function utcDayOffset(day: string, offset: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + offset*86400000).toISOString().slice(0,10);
}
function poolLabel(value: string): string {
  const whole=BigInt(value);
  const integer=whole/1000000000000000000n;
  const decimal=(whole%1000000000000000000n).toString().padStart(18,"0").slice(0,2).replace(/0+$/,"");
  return integer.toLocaleString("en-US")+(decimal?`.${decimal}`:"");
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
  const [tournamentInfo,setTournamentInfo]=useState<TournamentInfo|null>(null);
  const [leaderDay,setLeaderDay]=useState<string>("");
  const [leaderInfo,setLeaderInfo]=useState<TournamentInfo|null>(null);
  const [claimInfo,setClaimInfo]=useState<{day:string;collection:Identity;tokenId:number;joined:boolean;resultSubmitted:boolean;prizeClaimed:boolean;refundClaimed:boolean;score:bigint}|null>(null);
  const [entryStep,setEntryStep]=useState("");
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
  const [replay,setReplay]=useState<ReplayFrame[]>([]);
  const [replayIndex,setReplayIndex]=useState(0);
  const [replayPlaying,setReplayPlaying]=useState(false);
  const [replayLoading,setReplayLoading]=useState(false);
  const [replayError,setReplayError]=useState('');
  const replayIdRef=useRef('');
  const [live,setLive]=useState<LiveSession[]>([]);
  const [demoLive,setDemoLive]=useState<LiveSession[]>([]);
  const [leaders,setLeaders]=useState<Entry[]>([]);
  const [leaderMode,setLeaderMode]=useState<Mode>("ranked");
  const [leaderBoards,setLeaderBoards]=useState<Array<{id:number; artwork:Artwork}>>([]);
  const [leaderBoardsLoading,setLeaderBoardsLoading]=useState(false);
  const [exportingLeaderboard,setExportingLeaderboard]=useState(false);
  const [leaderLoading,setLeaderLoading]=useState(false);
  const [leaderError,setLeaderError]=useState("");
  const [watchMode,setWatchMode]=useState<Mode>("ranked");
  const [scrollOffset,setScrollOffset]=useState(8);
  const [wallet,setWallet]=useState<`0x${string}`|null>(null);
  const [entered,setEntered]=useState(false);
  const [fee,setFee]=useState<bigint>(parseUnits("100",18));
  const [,setAllowance]=useState<bigint>(BigInt(0));
  const [walletStatus,setWalletStatus]=useState("CONNECT WALLET TO ENTER");
  const [scoreSubmitted,setScoreSubmitted]=useState(false);
  const mounted=useRef(true);
  const busyRef=useRef(false);
  const tokenRef=useRef("");
  const sessionRef=useRef<Session|null>(null);
  const spectatorRef=useRef(false);
  const todayDay=now ? new Date(now).toISOString().slice(0,10) : "";
  const weekDays=todayDay?Array.from({length:7},(_,i)=>utcDayOffset(todayDay,-i)):[];
  const leaderEnd=leaderInfo?Date.parse(leaderInfo.endTime):0;
  const leaderState=leaderMode==="free"?"FREE PRACTICE · NO PRIZES":!leaderInfo?"LOADING…":leaderInfo.finalized?(leaderInfo.refundAll?"REFUNDS AVAILABLE":"SETTLED"):now<leaderEnd?`LIVE · ${dayClock(leaderEnd-now)} LEFT`:"READY TO SETTLE";
  const frame=spectating&&replay.length?replay[Math.min(replayIndex,replay.length-1)]:null;
  const current= frame?{...defaultState,round:frame.round,faceId:frame.faceId,rows:frame.rows,totalPoints:frame.totalPoints,roundPoints:frame.roundPoints}:session?.state ?? defaultState;
  const displayRows=frame?frame.rows:session?.state.rows?.length===8?session.state.rows:(preview?.rows ?? START_FACE_ROWS);
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
  const activeLive=[...live.map(item=>({...item,liveMode:"ranked" as const})),...demoLive.map(item=>({...item,liveMode:"free" as const}))].filter(item=>
    item.status==="playing" &&
    typeof item.lastActionAt==="number" &&
    now>0 &&
    now-item.lastActionAt>=0 &&
    now-item.lastActionAt<4*60*1000 &&
    (!daily || now<Date.parse(daily.tournamentEnd))
  );
  const attractMode = !session && !spectating;
  const gameOverMode = !!session && !spectating && (isDone || current.phase==="finished");
  const showPixelMessage = gameOverMode;
  const attractText = "GAME OVER";
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
    const watchKind:Mode=params.get("mode")==="free"?"free":"ranked";
    const restoredMode=window.sessionStorage.getItem("face64-flow-mode")==="free"?"free":"ranked";
    const storedId=window.sessionStorage.getItem(restoredMode==="free"?"face64-demo-id":"face64-ranked-id");
    const storedToken=window.sessionStorage.getItem(restoredMode==="free"?"face64-demo-token":"face64-ranked-token");

    // Defer React state changes to an async callback instead of setting state in the effect body.
    // The URL watch parameter takes precedence over a saved player session.
    if(watchId && /^[a-f\d-]{36}$/i.test(watchId)){
      spectatorRef.current=true;
      void Promise.resolve().then(()=>{
        if(!mounted.current)return;
        setSpectating(true);setScreen("watch");setWatchMode(watchKind);setMode(watchKind);
        return syncPublic(watchId,watchKind).catch(err=>setError(String(err)));
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
    const first=window.setTimeout(()=>{ const t=Date.now(); setNow(t); setLeaderDay(new Date(t).toISOString().slice(0,10)); },0);
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
    if(!spectating || replay.length>0 || !session?.sessionId || session.status!=="playing") return;
    const id=window.setInterval(()=>void syncPublic(session.sessionId,watchMode).catch(()=>{}),2000);
    return ()=>window.clearInterval(id);
  },[spectating,replay.length,session?.sessionId,session?.status,syncPublic,watchMode]);

  // Keep live games and the selected leaderboard independent: a leaderboard error
  // must never take the spectator feed down with it.
  useEffect(()=>{
    let cancelled=false;
    const update=async()=>{
      const [a,c]=await Promise.allSettled([
        readJSON<{sessions:LiveSession[]}>(`${API}/live`),
        readJSON<{sessions:LiveSession[]}>(`https://api.onchainhoodies.xyz/v1/face64/demo/live`)
      ]);
      if(cancelled)return;
      if(a.status==="fulfilled")setLive(a.value.sessions);
      if(c.status==="fulfilled")setDemoLive(c.value.sessions);
    };
    void update();const id=window.setInterval(()=>void update(),12000);
    return ()=>{cancelled=true;window.clearInterval(id);};
  },[]);
  useEffect(()=>{
    if(!leaderDay)return;
    let cancelled=false;
    const update=async()=>{
      try{
        const result=await readJSON<{entries:Entry[]}>(`${leaderMode==="free"?"https://api.onchainhoodies.xyz/v1/face64/demo":API}/leaderboard?day=${leaderDay}`);
        if(!cancelled){setLeaders(result.entries);setLeaderLoading(false);setLeaderError("");}
      }catch(e){if(!cancelled){setLeaderLoading(false);setLeaderError(e instanceof Error?e.message:"Leaderboard unavailable");}}
    };
    // Defer effect-driven state updates.
    void Promise.resolve().then(()=>{if(!cancelled){setLeaderLoading(true);setLeaders([]);setLeaderError("");return update();}});
    const id=window.setInterval(()=>void update(),12000);
    return ()=>{cancelled=true;window.clearInterval(id);};
  },[leaderDay,leaderMode]);
  useEffect(()=>{
    if(screen!=="leaderboard"||!leaderDay)return;
    let cancelled=false;
    void Promise.resolve().then(async()=>{
      if(cancelled)return;
      setLeaderBoards([]);setLeaderBoardsLoading(true);
      try{
        const ids=leaderDay===daily?.day&&daily.faceIds?.length===8?daily.faceIds:await dailyFaceIds(leaderDay);
        const boards=await Promise.all(ids.map(async(id)=>({id,artwork:await readJSON<Artwork>(`/api/face/${id}`)})));
        if(boards.some(b=>b.artwork.rows?.length!==8))throw new Error("Invalid board bitmap");
        if(!cancelled)setLeaderBoards(boards);
      }catch{if(!cancelled)setLeaderBoards([]);}
      finally{if(!cancelled)setLeaderBoardsLoading(false);}
    });
    return ()=>{cancelled=true;};
  },[screen,leaderDay,daily]);

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
    setEntered(false);setClaimInfo(null);setAllowance(BigInt(0));
    setEntryStep("");setMessage("WALLET CONNECTED");
  };
  const payEntry=async():Promise<void>=>{
    if(!wallet)throw new Error("Connect wallet first");
    const nft=nftAddress(collection);
    const reader=injected()?createPublicClient({transport:custom(injected()!)}):publicRpc;
    // Never trust a stale React entry/allowance value when real OCH is involved.
    const existing=await reader.readContract({address:TOURNAMENT,abi:ABI,functionName:"getEntry",args:[utcDayNumber(),nft,BigInt(tokenId)]});
    if(existing.joined){setEntered(true);return;}
    const owner=await reader.readContract({address:nft,abi:ABI,functionName:"ownerOf",args:[BigInt(tokenId)]});
    if(owner.toLowerCase()!==wallet.toLowerCase())throw new Error("Connected wallet is not the NFT owner. TBA/delegation entry is not yet supported in this interface.");
    const [freshFee,enabled,paused,freshAllowance]=await Promise.all([
      reader.readContract({address:TOURNAMENT,abi:ABI,functionName:"entryFee"}),
      reader.readContract({address:TOURNAMENT,abi:ABI,functionName:"paidEnabled"}),
      reader.readContract({address:TOURNAMENT,abi:ABI,functionName:"entriesPaused"}),
      reader.readContract({address:OCH,abi:ABI,functionName:"allowance",args:[wallet,TOURNAMENT]})
    ]);
    if(paused)throw new Error("Tournament entries are paused");
    const payableFee=enabled?freshFee:BigInt(0);
    setFee(payableFee);setAllowance(freshAllowance);
    const client=walletClient();
    if(freshAllowance<payableFee){
      setEntryStep("1/3 · APPROVE OCH");setWalletStatus("APPROVE OCH IN WALLET");
      const hash=await client.writeContract({address:OCH,abi:ABI,functionName:"approve",args:[TOURNAMENT,payableFee]});
      const receipt=await reader.waitForTransactionReceipt({hash});
      if(receipt.status!=="success")throw new Error("OCH approval reverted");
      setAllowance(payableFee);
    }
    setEntryStep("2/3 · CONFIRM TOURNAMENT ENTRY");
    setWalletStatus("CONFIRM ENTRY IN WALLET");
    const hash=await client.writeContract({address:TOURNAMENT,abi:ABI,functionName:"enter",args:[nft,BigInt(tokenId)]});
    const receipt=await reader.waitForTransactionReceipt({hash});
    if(receipt.status!=="success")throw new Error("Tournament entry reverted");
    setEntered(true);setMessage("ENTRY CONFIRMED · STARTING GAME");
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
    if(busyRef.current)return;
    if(!wallet){await connectWallet();return;}
    busyRef.current=true;setBusy(true);setError("");
    try {
      // Recheck on-chain even if the cached UI says ENTRY CONFIRMED.
      // This also recovers if a previous payment succeeded but signing failed.
      const reader=injected()?createPublicClient({transport:custom(injected()!)}):publicRpc;
      const currentEntry=await reader.readContract({address:TOURNAMENT,abi:ABI,functionName:"getEntry",args:[utcDayNumber(),nftAddress(collection),BigInt(tokenId)]});
      if(!currentEntry.joined)await payEntry();
      else setEntered(true);
      setEntryStep("3/3 · SIGN GAME SESSION");
    } catch(e){setError(e instanceof Error?e.message:String(e));busyRef.current=false;setBusy(false);return;}
    busyRef.current=false;setBusy(false);
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
  const choosePlayer=(id:number,img?:string)=>{setTokenId(id);setEntered(false);setScoreSubmitted(false);setClaimInfo(null);setEntryStep("");setSelectedImage(img||null);setScreen("mode");setError("");};
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
    void readJSON<TournamentInfo>(`${API}/tournament`)
      .then(v=>{if(!cancelled){setTournamentInfo(v);setFee(BigInt(v.fee));}}).catch(()=>{});
    return ()=>{cancelled=true;};
  },[screen]);
  useEffect(()=>{
    if(screen!=="leaderboard"||!leaderDay)return;
    let cancelled=false;
    void Promise.resolve().then(()=>{if(!cancelled){setLeaderInfo(null);setClaimInfo(null);}});
    void readJSON<TournamentInfo>(`${API}/tournament?day=${leaderDay}`).then(t=>{if(!cancelled)setLeaderInfo(t);}).catch(()=>{if(!cancelled)setLeaderInfo(null);});
    return ()=>{cancelled=true;};
  },[screen,leaderDay]);
  useEffect(()=>{
    if(screen!=="leaderboard"||!wallet||!leaderInfo)return;
    let cancelled=false;
    const targetDay=leaderInfo.day,targetCollection=collection,targetId=tokenId;
    const client=injected()?createPublicClient({transport:custom(injected()!)}):publicRpc;
    void client.readContract({address:TOURNAMENT,abi:ABI,functionName:"getEntry",args:[BigInt(targetDay),nftAddress(targetCollection),BigInt(targetId)]})
      .then(e=>{if(!cancelled)setClaimInfo({day:targetDay,collection:targetCollection,tokenId:targetId,joined:e.joined,resultSubmitted:e.resultSubmitted,prizeClaimed:e.prizeClaimed,refundClaimed:e.refundClaimed,score:e.score});})
      .catch(()=>{if(!cancelled)setClaimInfo(null);});
    return ()=>{cancelled=true;};
  },[screen,leaderInfo,wallet,collection,tokenId]);
  const selectedClaimReady=Boolean(leaderInfo&&claimInfo&&claimInfo.day===leaderInfo.day&&claimInfo.collection===collection&&claimInfo.tokenId===tokenId);
  const onchainTournamentAction=async(fn:"finalize"|"claimPrize"|"claimRefund")=>{
    if(!wallet){await connectWallet();return;}
    if(!leaderInfo)throw new Error("Tournament data unavailable");
    setBusy(true);setError("");
    try{
      const hash=fn==="finalize"
        ?await walletClient().writeContract({address:TOURNAMENT,abi:ABI,functionName:"finalize",args:[BigInt(leaderInfo.day)]})
        :fn==="claimPrize"
          ?await walletClient().writeContract({address:TOURNAMENT,abi:ABI,functionName:"claimPrize",args:[BigInt(leaderInfo.day),nftAddress(collection),BigInt(tokenId)]})
          :await walletClient().writeContract({address:TOURNAMENT,abi:ABI,functionName:"claimRefund",args:[BigInt(leaderInfo.day),nftAddress(collection),BigInt(tokenId)]});
      const receipt=await (injected()?createPublicClient({transport:custom(injected()!)}):publicRpc).waitForTransactionReceipt({hash});
      if(receipt.status!=="success")throw new Error("Transaction reverted");
      const fresh=await readJSON<TournamentInfo>(`${API}/tournament?day=${leaderDay}`);
      setLeaderInfo(fresh);setMessage("TRANSACTION CONFIRMED");
      const e=await (injected()?createPublicClient({transport:custom(injected()!)}):publicRpc).readContract({address:TOURNAMENT,abi:ABI,functionName:"getEntry",args:[BigInt(fresh.day),nftAddress(collection),BigInt(tokenId)]});
      setClaimInfo({day:fresh.day,collection,tokenId,joined:e.joined,resultSubmitted:e.resultSubmitted,prizeClaimed:e.prizeClaimed,refundClaimed:e.refundClaimed,score:e.score});
    }finally{setBusy(false);}
  };
  const loadReplay=useCallback(async(id:string)=>{
    replayIdRef.current=id;
    setReplay([]);setReplayIndex(0);setReplayPlaying(false);setReplayLoading(true);setReplayError('');
    try{
      const data=await readJSON<ReplayPayload>(`${watchMode==="free"?"https://api.onchainhoodies.xyz/v1/face64/demo":API}/sessions/${id}/replay`);
      if(data.truncated)throw new Error('Replay history exceeds the safe event limit.');
      if(!data.faceIds?.length)throw new Error('No historical boards found for this session.');
      const artworks=await Promise.all(data.faceIds.map(faceId=>readJSON<Artwork>(`/api/face/${faceId}`)));
      if(artworks.some(a=>a.rows?.length!==8))throw new Error('A replay board could not be loaded.');
      const frames=replayFrames(data,artworks.map(a=>a.rows));
      if(replayIdRef.current===id){setReplay(frames);setReplayIndex(0);setReplayPlaying(true);}
    }catch(e){if(replayIdRef.current===id)setReplayError(e instanceof Error?e.message:String(e));}
    finally{if(replayIdRef.current===id)setReplayLoading(false);}
  },[watchMode]);
  useEffect(()=>{
    if(!spectating||!session||session.status==='playing'||replay.length||replayLoading||replayError||!replayIdRef.current)return;
    void loadReplay(replayIdRef.current);
  },[spectating,session,session?.status,replay.length,replayLoading,replayError,loadReplay]);
  useEffect(()=>{
    if(!replayPlaying || replay.length===0 || screen!=="watch" || !spectating)return;
    const timer=window.setInterval(()=>setReplayIndex(i=>{
      if(i>=replay.length-1){setReplayPlaying(false);return i;}
      return i+1;
    }),135);
    return ()=>window.clearInterval(timer);
  },[replayPlaying,replay.length,screen,spectating]);
  const watch=(id:string,kind:Mode="ranked")=>{
    setWatchMode(kind);
    replayIdRef.current=id;setReplay([]);setReplayPlaying(false);setReplayError("");
    spectatorRef.current=true;setSpectating(true);setScreen("watch");setMode(kind);setPosition(null);setMessage("WATCHING LIVE GAME");
    window.history.replaceState({},"",`/game?watch=${encodeURIComponent(id)}&mode=${kind}`);
    void syncPublic(id,kind).catch(e=>setError(String(e)));
  };
  const backToPlayer=()=>{
    replayIdRef.current='';setReplayPlaying(false);setReplay([]);setReplayIndex(0);setReplayError('');
    spectatorRef.current=false;setSpectating(false);setSession(null);sessionRef.current=null;setPosition(null);
    setScreen('leaderboard');window.history.replaceState({},'', '/game');
  };
  const visiblePosition=frame?frame.position:position===null?pathIndex(start):position;
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
  const exportLeaderboardPNG=async()=>{
    if(exportingLeaderboard||leaderLoading||leaderBoards.length!==8||leaderError||!leaderDay||(leaderMode==="ranked"&&!leaderInfo))return;
    setExportingLeaderboard(true);setError("");
    try{
      try{await document.fonts.load('24px "Departure Mono"');}catch{/* fallback */}
      // Limit the share card to the top 15, but leave the interactive leaderboard complete.
      const shown=leaders.slice(0,15);
      const width=1200,margin=72,rowHeight=74;
      const height=850+Math.max(3,shown.length)*rowHeight;
      const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas unavailable");
      ctx.imageSmoothingEnabled=false;
      ctx.fillStyle=BLACK;ctx.fillRect(0,0,width,height);
      ctx.strokeStyle=GREEN;ctx.lineWidth=2;ctx.strokeRect(32,32,width-64,height-64);
      const font='"Departure Mono", monospace';
      const text=(value:string,x:number,y:number,size:number,align:CanvasTextAlign="left",color=GREEN)=>{
        ctx.fillStyle=color;ctx.font=`${size}px ${font}`;ctx.textBaseline="top";ctx.textAlign=align;ctx.fillText(value,x,y);
      };
      const rule=(y:number)=>{ctx.strokeStyle="#536d24";ctx.beginPath();ctx.moveTo(margin,y);ctx.lineTo(width-margin,y);ctx.stroke();};
      text("FACE64.",margin,76,72);
      text("DAILY LEADERBOARD",width-margin,84,25,"right");
      text(leaderMode==="ranked"?"TOURNAMENT":"FREE PLAY",margin,174,22);
      text(leaderDay,width-margin,174,22,"right");
      rule(219);
      text(leaderMode==="ranked"?`POOL ${poolLabel(leaderInfo!.pool)} OCH`:"FREE PRACTICE",margin,251,47);
      // A share image is a snapshot; show a static end time, not a stale live countdown.
      const status=leaderMode==="free"?"NO PRIZES":leaderInfo!.finalized?(leaderInfo!.refundAll?"REFUNDS":"SETTLED"):`ENDS ${leaderInfo!.endTime.slice(0,16).replace("T"," ")} UTC`;
      text(status,margin,318,19);
      rule(373);
      text("8 DAILY GAME LEVELS",margin,394,19);
      const edge=104,gap=23,startX=Math.round((width-(8*edge+7*gap))/2),topY=448;
      leaderBoards.forEach(({id,artwork},i)=>{
        const x=startX+i*(edge+gap),unit=edge/8;
        ctx.fillStyle=artwork.background??BLACK;ctx.fillRect(x,topY,edge,edge);
        ctx.strokeStyle="#819d33";ctx.strokeRect(x-2,topY-2,edge+4,edge+4);
        ctx.fillStyle=artwork.foreground??GREEN;
        for(let y=0;y<8;y++)for(let col=0;col<8;col++)if((artwork.rows[y]??0)&(128>>col))ctx.fillRect(x+col*unit,topY+y*unit,unit,unit);
        text(String(i+1),x+edge/2,topY+119,16,"center");
        text(`#${id}`,x+edge/2,topY+146,14,"center");
      });
      rule(649);text(shown.length?`TOP ${shown.length} PLAYERS`:"NO FINISHED GAMES",margin,667,20);
      shown.forEach((entry,i)=>{
        const y=721+i*rowHeight;
        text(String(i+1).padStart(2,"0"),margin+8,y,21);
        text(displayName(entry.collection,entry.tokenId),margin+90,y,25);
        if(entry.runner==="bankr")text("BANKR · AGENT-DECLARED",margin+90,y+32,14);
        text(`${entry.score} PTS`,width-margin-8,y+8,23,"right");
        rule(y+rowHeight-11);
      });
      text("FACE64 / ROBINHOOD CHAIN",margin,height-91,17);
      text("64FACES.FILTER8.XYZ",width-margin,height-91,17,"right");
      await new Promise<void>((resolve,reject)=>{
        canvas.toBlob(blob=>{
          if(!blob){reject(new Error("PNG export failed"));return;}
          const url=URL.createObjectURL(blob);const a=document.createElement("a");
          a.download=`face64-${leaderMode}-${leaderDay}-leaderboard.png`;a.href=url;
          document.body.appendChild(a);a.click();a.remove();
          window.setTimeout(()=>URL.revokeObjectURL(url),3000);resolve();
        },"image/png");
      });
    }catch(e){setError(e instanceof Error?e.message:"Could not export leaderboard");}
    finally{setExportingLeaderboard(false);}
  };
  const gameBoard=<>
    <div className={styles.hud}><span>{spectating?(frame?`REPLAY · ROUND ${frame.round+1}/8`:"WATCH LIVE"):`ROUND ${session?Math.min(current.round+1,8):1} / 8`}</span><span>FACE #{current.faceId||daily?.faceIds?.[0]||"—"}</span></div>
    <div className="f64-playing">{session?.runner==="bankr"&&<span className="f64-agent-tag">🤖 BANKR · AGENT-DECLARED · </span>}{session?displayName(session.identity.collection,session.identity.tokenId):displayName(collection,tokenId)} · {mode==="free"?"FREE":"TOURNAMENT"}</div>
    <div className={styles.timer}><span>SESSION <strong>{spectating&&frame?"REPLAY":remaining!==null?timeLeft(remaining):"04:00"}</strong></span><span>DAILY <strong>{dailyRemaining!==null?dayClock(dailyRemaining):"--:--"}</strong></span></div>
    <div className={`${styles.frame} f64-game-display`}>
      <div className={styles.board} role="img" aria-label={`FACE64 LED; ${count} lit pixels`}>
        {Array.from({length:N},(_,index)=>{
          const active=lit(screenRows,index);
          const cursor=!showPixelMessage&&!!session&&visiblePosition===index&&(frame!==null||current.phase!=="finished");
          const potential=!showPixelMessage&&showOdds&&possibleLandings.includes(index);
          return <div className={`${styles.cell}${potential?(active?" f64-possible-hit":" f64-possible-miss"):""}${cursor?" f64-cursor":""}`} key={index} style={{backgroundColor:showPixelMessage?(active?GREEN:BLACK):(active?previewFg:previewBg),position:"relative",zIndex:cursor?2:potential?1:0}}/>;
        })}
      </div>
    </div>
    <div className="f64-odds"><span>7–13 STEPS</span><strong className="f64-odds-percent">{showOdds?`${probability}%`:"—"}</strong><span>{showOdds?`${hitCount}/7 CHANCES HIT GREEN`:"CHOOSE YOUR START PIXEL"}</span></div>
    <div className="f64-legend"><span><i className="f64-legend-start"/> START</span><span><i className="f64-legend-hit"/> POSSIBLE HIT</span><span><i className="f64-legend-miss"/> POSSIBLE MISS</span></div>
    <div className={styles.readout} aria-live="polite">{frame?frame.label:busy&&!animation?"LOADING…":message}</div>
    <div className={`${styles.stats} f64-stats-v21`}><span>BANKED <strong>{current.totalPoints}</strong></span><span className="f64-risk">AT RISK <strong>{current.roundPoints}</strong></span><span>PRIZE POOL <strong>{mode==="ranked"&&tournamentInfo?`${(Number(BigInt(tournamentInfo.pool))/1e18).toLocaleString(undefined,{maximumFractionDigits:2})}`:"—"}</strong><em>OCH</em></span></div>
  </>;
  // The JSX below only invokes watch() from click handlers. React refs are
  // never read during render; eslint-config-next can misclassify this callback.
  /* eslint-disable react-hooks/refs -- spectator callbacks access refs only on clicks */
  return <div className={`${styles.page} f64-flow-page`}>
    <header className={styles.header}><Link href="/" className={styles.brand}>64 FACES</Link><nav><span>FACE64 / ARCADE</span><button className="f64-text-btn" onClick={resetFlow}>HOME ↗</button></nav></header>
    <main className="f64-flow-shell">
      <div className="f64-flow-top"><span>FACE64 / {screen.toUpperCase()}</span><span>8 ROUNDS · 8×8 PIXELS</span></div>
      <section className="f64-flow-card">
        {screen==="welcome"&&<div className="f64-screen f64-center">
          <div className="f64-overline">ON-CHAIN ARCADE / ROBINHOOD CHAIN</div><h1 className="f64-title">FACE64<span>.</span></h1>
          <p className="f64-sub">FIND YOUR PIXEL. RISK THE RUN. BANK THE POINTS.</p>
          <div className="f64-home-led" aria-hidden="true">{Array.from({length:64},(_,i)=><i key={i} className={lit(preview?.rows?.length===8?preview.rows:START_FACE_ROWS,i)?"on":""}/>)}</div>
          {session?.status==="playing"&&!spectating&&<div className="f64-flow-actions"><button onClick={()=>setScreen("game")}>RESUME MY GAME →</button></div>}
          <div className="f64-flow-actions f64-welcome-actions"><button onClick={()=>{setScreen("collection");setError("");}}>PLAY</button><button className="f64-alt" onClick={()=>{setScreen("leaderboard");setError("");}}>LEADERBOARD</button><button className="f64-alt" onClick={()=>setScreen("watch")}>WATCH LIVE {activeLive.length?`(${activeLive.length})`:""}</button></div>
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
          {!ownedLoading&&wallet&&owned.length===0&&<div className="f64-empty-market"><p>NO {collection==="face"?"64 FACES":"HOODIES"} FOUND IN THIS WALLET</p><a href={`https://opensea.io/assets/robinhood/${nftAddress(collection)}`} target="_blank" rel="noopener noreferrer">FIND ON OPENSEA ↗</a><p>OR USE ANY TOKEN ID FOR FREE PRACTICE</p></div>}
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
          {mode==="ranked"&&<p className="f64-flow-note"><a className="f64-swap-link" href="https://onchainhoodies.xyz/och#swap" target="_blank" rel="noopener noreferrer">NEED OCH? BUY OCH ↗</a></p>}
          {mode==="ranked"&&<><div className="f64-flow-wallet">{wallet?`${wallet.slice(0,6)}…${wallet.slice(-4)}`:"CONNECT A WALLET TO ENTER"}<button onClick={()=>void connectWallet().catch(e=>setError(String(e)))}>CONNECT</button></div><p className="f64-flow-note">{entryStep||walletStatus}</p></>}
          <div className="f64-flow-actions"><button disabled={busy} onClick={()=>void (mode==="free"?makeFreeSession():beginRanked()).catch(e=>setError(String(e)))}>{busy?"WAIT…":mode==="free"?"START FREE GAME":!wallet?"CONNECT WALLET":entered?"START GAME":"PAY & PLAY"}</button></div>
          <button className="f64-back" onClick={()=>setScreen("mode")}>← BACK TO MODES</button>
        </div>}
        {(screen==="game"||screen==="watch")&&<div className="f64-screen f64-game-screen"><div className="f64-game-center">{gameBoard}</div>
          {screen==="game"&&!spectating?<><div className="f64-controls3">
            <button type="button" disabled={!gameReady||busy||animation} onPointerDown={e=>{e.preventDefault();startHold();}} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}>NEXT PIXEL</button>
            <button type="button" className="f64-bank-button" disabled={!decision||busy||animation} onClick={()=>void bank()}>BANK</button>
            <button type="button" className="f64-run-button" disabled={!gameReady||busy||animation} onClick={()=>void action()}>RUN</button>
          </div><p className="f64-flow-note">SPACE: NEXT PIXEL · ENTER: RUN · B: BANK · {decision?"BANK ANYTIME AFTER A HIT":"CHOOSE YOUR START POSITION"}</p></>:
          <div className="f64-replay-controls">
            {replayLoading&&<p>LOADING RECORDED GAME…</p>}
            {replayError&&<p role="alert">REPLAY UNAVAILABLE: {replayError}</p>}
            {replay.length>0&&<><div className="f64-replay-progress">PLAYBACK {Math.round((replayIndex+1)/replay.length*100)}% · {Math.min(replayIndex+1,replay.length)} / {replay.length} FRAMES</div>
              <div className="f64-flow-actions"><button onClick={()=>{if(replayIndex>=replay.length-1)setReplayIndex(0);setReplayPlaying(p=>!p||replayIndex>=replay.length-1);}}>{replayPlaying?'PAUSE':'PLAY REPLAY'}</button><button className="f64-alt" onClick={()=>{setReplayIndex(0);setReplayPlaying(true);}}>RESTART</button></div></>}
            {!replayLoading&&!replay.length&&!replayError&&<p>{session?.status==='playing'?'LIVE VIEW · UPDATES EVERY 2 SECONDS':'LOADING REPLAY…'}</p>}
            <button className="f64-wideButton" onClick={backToPlayer}>← BACK TO LEADERBOARD</button>
          </div>}
          {session&&<p className="f64-flow-note">{session.status==="playing"?"4-MINUTE INACTIVITY LIMIT":"SESSION ENDED"} · {mode==="ranked"?"PAID RANKED":"FREE PRACTICE"}</p>}
        </div>}
        {screen==="result"&&<div className="f64-screen f64-center"><div className="f64-overline">GAME COMPLETE</div><h2>GAME OVER</h2><div className="f64-result-score">{current.totalPoints}<span>POINTS</span></div><p className="f64-sub">{displayName(collection,tokenId)} · {current.round>=8?"8 ROUNDS COMPLETED":"SESSION ENDED EARLY"}</p>
          {mode==="ranked"&&!scoreSubmitted?<><p className="f64-sub">YOUR SCORE MUST BE SUBMITTED ON-CHAIN TO COUNT.</p><div className="f64-flow-actions"><button disabled={busy} onClick={()=>void (async()=>{try{setBusy(true);setError("");await submitScore();}catch(e){setError(String(e));}finally{setBusy(false);}})()}>{busy?"WAITING FOR WALLET…":"SUBMIT SCORE"}</button></div></>:
          <p className="f64-flow-note">{mode==="free"?"PRACTICE SCORE · NOT ON CHAIN":"SCORE RECORDED ON-CHAIN ✓"}</p>}
          <div className="f64-flow-actions"><button className="f64-alt" onClick={()=>setScreen("leaderboard")}>VIEW LEADERBOARD →</button></div>
        </div>}
        {screen==="leaderboard"&&<div className="f64-screen f64-leader-screen">
          <h2>DAILY LEADERBOARD</h2>
          <div className="f64-board-tabs" role="group" aria-label="Leaderboard mode"><button className={leaderMode==="ranked"?"selected":""} onClick={()=>setLeaderMode("ranked")}>TOURNAMENT</button><button className={leaderMode==="free"?"selected":""} onClick={()=>setLeaderMode("free")}>FREE PLAY</button></div>
          <div className="f64-week-tabs" role="group" aria-label="Choose leaderboard day">{weekDays.map((day,i)=><button key={day} className={leaderDay===day?"selected":""} title={day} aria-label={`Day ${i+1}: ${day}`} aria-pressed={leaderDay===day} onClick={()=>setLeaderDay(day)}>{i+1}</button>)}</div>
          <p className="f64-week-date">{leaderDay} <span>· 1 TODAY / 7 SIX DAYS AGO · UTC</span></p>
          <div className="f64-pool-panel"><span className="f64-pool-eyebrow">{leaderMode==="ranked"?"DAILY PRIZE POOL":"PRACTICE MODE"}</span><div className="f64-pool-value">{leaderMode==="free"?"FREE PLAY":leaderInfo?`${poolLabel(leaderInfo.pool)} OCH`:"— OCH"}</div><div className="f64-pool-clock">{leaderState}</div></div>
          <div className="f64-levels-label">8 DAILY GAME LEVELS</div>
          <div className="f64-levels">{leaderBoards.length===8?leaderBoards.map(({id,artwork},i)=><div className="f64-level" key={`${leaderDay}-${id}`} title={`Round ${i+1} · Face #${id}`}><div className="f64-level-pixels">{Array.from({length:64},(_,cell)=><i key={cell} style={{backgroundColor:lit(artwork.rows,cell)?(artwork.foreground??GREEN):(artwork.background??BLACK)}}/>)}</div><span>{i+1}</span><small>#{id}</small></div>):<p>{leaderBoardsLoading?"LOADING DAILY LEVELS…":"DAILY LEVELS UNAVAILABLE"}</p>}</div>
          <div className="f64-leader-list">{leaderLoading?<p>LOADING SCORES…</p>:leaderError?<p role="alert">{leaderError}</p>:leaders.length?leaders.map((entry,i)=><button key={entry.sessionId} onClick={()=>watch(entry.sessionId,leaderMode)}><span>{String(i+1).padStart(2,"0")}</span><span>{displayName(entry.collection,entry.tokenId)}{entry.runner==="bankr"&&<small className="f64-agent-tag">🤖 BANKR · AGENT-DECLARED</small>}</span><strong>{entry.score} PTS</strong></button>):<p>NO FINISHED GAMES FOR THIS DAY.</p>}</div>
          {leaderMode==="ranked"&&leaderInfo&&<div className="f64-settlement-actions">
            {!leaderInfo.finalized&&now>=Date.parse(leaderInfo.endTime)&&<button disabled={busy} className="f64-wideButton" onClick={()=>void onchainTournamentAction("finalize").catch(e=>setError(String(e)))}>SETTLE TOURNAMENT</button>}
            {leaderInfo.finalized&&leaderInfo.refundAll&&selectedClaimReady&&claimInfo?.joined&&!claimInfo.refundClaimed&&<button disabled={busy} className="f64-wideButton" onClick={()=>void onchainTournamentAction("claimRefund").catch(e=>setError(String(e)))}>CLAIM REFUND · ORIGINAL PAYER</button>}
            {leaderInfo.finalized&&!leaderInfo.refundAll&&selectedClaimReady&&claimInfo?.resultSubmitted&&!claimInfo.prizeClaimed&&claimInfo.score===BigInt(leaderInfo.winningScore)&&<button disabled={busy} className="f64-wideButton" onClick={()=>void onchainTournamentAction("claimPrize").catch(e=>setError(String(e)))}>CLAIM WINNER PRIZE TO NFT WALLET</button>}
            {leaderInfo.finalized&&!leaderInfo.refundAll&&<p>WINNING SCORE {leaderInfo.winningScore} · {leaderInfo.winnerCount} WINNER(S)</p>}
          </div>}
          <p className="f64-flow-note">FREE SCORES ARE FOR PRACTICE. TOURNAMENT PRIZES USE SUBMITTED ON-CHAIN SCORES. CLAIMS USE THE NFT SELECTED IN PLAYER SETUP.</p>
          <div className="f64-leader-buttons"><button disabled={exportingLeaderboard||leaderBoards.length!==8||leaderLoading||!!leaderError||(leaderMode==="ranked"&&!leaderInfo)} onClick={()=>void exportLeaderboardPNG()}>{exportingLeaderboard?"PREPARING PNG…":"↓ EXPORT LEADERBOARD PNG"}</button><button className="f64-alt" onClick={resetFlow}>PLAY AGAIN</button><button className="f64-alt" onClick={()=>setScreen("watch")}>WATCH LIVE</button></div>
        </div>}
        {screen==="watch"&&!spectating&&<div className="f64-screen"><h2>WATCH LIVE</h2><p className="f64-sub">ACTIVE FACE64 GAMES · TOURNAMENT AND FREE</p>
          <div className="f64-leader-list">{activeLive.length?activeLive.map(item=><button key={item.sessionId} onClick={()=>watch(item.sessionId,item.liveMode)}><span>●</span><span>{displayName(item.collection,item.tokenId)}{item.runner==="bankr"&&<small className="f64-agent-tag">🤖 BANKR · AGENT-DECLARED</small>} · ROUND {Math.min(item.state.round+1,8)}/8</span><strong>{item.state.totalPoints} PTS</strong></button>):<p>NO LIVE GAMES RIGHT NOW.</p>}</div>
          <div className="f64-flow-actions"><button onClick={()=>setScreen("leaderboard")}>LEADERBOARD</button><button className="f64-alt" onClick={resetFlow}>BACK TO START</button></div>
        </div>}
        {error&&<div className={styles.error} role="alert">{error}</div>}
      </section>
    </main>
  </div>;
  /* eslint-enable react-hooks/refs */
}
