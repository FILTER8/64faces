"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPublicClient, createWalletClient, custom, http, parseAbi, parseUnits } from "viem";
import "./game.css";
const styles = {page:"f64-page", header:"f64-header", brand:"f64-brand", shell:"f64-shell", intro:"f64-intro", eyebrow:"f64-eyebrow", dot:"f64-dot", layout:"f64-layout", machine:"f64-machine", hud:"f64-hud", frame:"f64-frame", board:"f64-board", cell:"f64-cell", readout:"f64-readout", stats:"f64-stats", position:"f64-position", controls:"f64-controls", hint:"f64-hint", error:"f64-error", sessionNote:"f64-sessionNote", identity:"f64-identity", wideButton:"f64-wideButton", side:"f64-side", panel:"f64-panel", panelTitle:"f64-panelTitle", rounds:"f64-rounds", highlight:"f64-highlight", small:"f64-small", row:"f64-row", disclaimer:"f64-disclaimer", timer:"f64-timer", status:"f64-status"} as const;

const API = "https://api.onchainhoodies.xyz/v1/face64/ranked";
const TOURNAMENT = "0x753aa3bFd757D62e69389D90359bCB0c315b7c38" as const;
const OCH = "0x8BDD5adFF8A9D08372323d5BAF5e8e52605AF983" as const;
const FACES = "0xc8e36ae47246e5943da2b228fbaff1fb27a473b0" as const;
const HOODIES = "0x9ec6c5b9f572a9b02138e553bc5f5882da735f45" as const;
const rpc = createPublicClient({ transport:http("https://rpc.mainnet.chain.robinhood.com") });
const ABI = parseAbi([
 "function entryFee() view returns (uint256)",
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
type Session = { sessionId: string; day: string; identity: {collection: Identity;tokenId:number}; status: "playing"|"finished"|"timed_out"|"closed"; state: State; inactivityDeadline: number; dayEnd: number; version: number; sessionToken?: string; prototype: boolean };
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
  const [daily,setDaily]=useState<Daily|null>(null);
  const [preview,setPreview]=useState<Artwork|null>(null);
  const [now,setNow]=useState(0);
  const [session,setSession]=useState<Session|null>(null);
  const [credential,setCredential]=useState("");
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
  const canStart=!session || isDone;
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

  const syncPublic=useCallback(async(id:string)=>{
    const fresh=await readJSON<Session>(`${API}/sessions/${id}`);
    if(mounted.current){setSession(fresh);sessionRef.current=fresh;setScoreSubmitted(false);}
  },[]);

  useEffect(()=>{
    mounted.current=true;
    const provider=injected();
    if(provider) void provider.request({method:"eth_accounts"}).then(result=>{
      if(Array.isArray(result)&&typeof result[0]==="string")setWallet(result[0] as `0x${string}`);
    }).catch(()=>{});
    const params=new URLSearchParams(window.location.search);
    const watchId=params.get("watch");
    const storedId=window.sessionStorage.getItem("face64-ranked-id");
    const storedToken=window.sessionStorage.getItem("face64-ranked-token");
    // Defer React state changes to an async callback instead of setting state in the effect body.
    // The URL watch parameter takes precedence over a saved player session.
    if(watchId && /^[a-f\d-]{36}$/i.test(watchId)){
      spectatorRef.current=true;
      void Promise.resolve().then(()=>{
        if(!mounted.current)return;
        setSpectating(true);
        return syncPublic(watchId).catch(err=>setError(String(err)));
      });
    }else if(storedId && storedToken){
      tokenRef.current=storedToken;
      void Promise.resolve().then(()=>{
        if(!mounted.current)return;
        setCredential(storedToken);
        return syncPublic(storedId).catch(()=>{
          window.sessionStorage.removeItem("face64-ranked-id");
          window.sessionStorage.removeItem("face64-ranked-token");
        });
      });
    }
    void readJSON<Daily>(`${API}/daily`).then(setDaily).catch(err=>setError(err instanceof Error?err.message:"Could not load daily challenge"));
    return ()=>{mounted.current=false;};
  },[syncPublic]);

  useEffect(()=>{
    const tick=()=>setNow(Date.now());tick();
    const id=window.setInterval(tick,1000);
    return ()=>window.clearInterval(id);
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
      rpc.readContract({address:TOURNAMENT,abi:ABI,functionName:"getEntry",args:[utcDayNumber(),nft,BigInt(id)]}),
      rpc.readContract({address:TOURNAMENT,abi:ABI,functionName:"entryFee"}),
      rpc.readContract({address:TOURNAMENT,abi:ABI,functionName:"paidEnabled"}),
      rpc.readContract({address:TOURNAMENT,abi:ABI,functionName:"entriesPaused"}),
      rpc.readContract({address:OCH,abi:ABI,functionName:"allowance",args:[walletAddress,TOURNAMENT]})
    ]);
    setEntered(entry.joined);if(entry.resultSubmitted)setScoreSubmitted(true);setFee(enabled?entryFee:BigInt(0));setAllowance(approved);
    setWalletStatus(paused?"ENTRIES PAUSED":entry.joined?"ENTRY CONFIRMED":`ENTRY FEE ${Number(entryFee)/1e18} OCH`);
  },[]);
  useEffect(()=>{
    if(!wallet||spectating)return;
    // RPC-driven state updates happen after the asynchronous read completes.
    void Promise.resolve().then(()=>refreshEntry(wallet,collection,tokenId)).catch(e=>setError(String(e)));
  },[wallet,collection,tokenId,spectating,refreshEntry]);
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
    const owner=await rpc.readContract({address:nft,abi:ABI,functionName:"ownerOf",args:[BigInt(tokenId)]});
    if(owner.toLowerCase()!==wallet.toLowerCase())throw new Error("Connected wallet is not the current NFT owner. TBA/delegation entry is not yet in this browser flow.");
    const client=walletClient();
    if(allowance<fee){
      setWalletStatus("APPROVE OCH IN WALLET");
      const hash=await client.writeContract({address:OCH,abi:ABI,functionName:"approve",args:[TOURNAMENT,fee]});
      const receipt=await rpc.waitForTransactionReceipt({hash});if(receipt.status!=="success")throw new Error("OCH approval reverted");
      await refreshEntry(wallet,collection,tokenId);
      setMessage("APPROVED · CLICK ENTER AGAIN");return;
    }
    setWalletStatus("CONFIRM ENTRY IN WALLET");
    const hash=await client.writeContract({address:TOURNAMENT,abi:ABI,functionName:"enter",args:[nft,BigInt(tokenId)]});
    const receipt=await rpc.waitForTransactionReceipt({hash});if(receipt.status!=="success")throw new Error("Tournament entry reverted");
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
    const receipt=await rpc.waitForTransactionReceipt({hash});if(receipt.status!=="success")throw new Error("Result transaction reverted");
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
      tokenRef.current=secret;setCredential(secret);
      sessionRef.current=created;setSession(created);setStart(0);setPosition(null);
      window.sessionStorage.setItem("face64-ranked-id",created.sessionId);
      window.sessionStorage.setItem("face64-ranked-token",secret);
      setMessage("CHOOSE POSITION · RUN TO SPIN");
      window.history.replaceState({},"", "/game");
    }catch(e){setError(e instanceof Error?e.message:"Could not start game");}
    finally{busyRef.current=false;setBusy(false);}
  };
  const animate=async(outcome:Outcome)=>{
    // Server has already decided and saved the landing; animation never picks a result.
    const path=stepsPath(outcome.start,outcome.steps);
    setAnimation(true);setMessage("ROULETTE · BRAKING…");
    for(let i=0;i<path.length;i++){
      if(!mounted.current)break;
      setPosition(path[i]);
      const progress=(i+1)/path.length;
      await sleep(Math.round(55+210*progress*progress));
    }
    if(mounted.current){setMessage(outcome.hit?`HIT +${outcome.earned} · PIXEL REMOVED`:"MISS · ROUND OVER");setAnimation(false);}
  };
  const move=()=>{
    if(busyRef.current||animation||spectating||!gameReady)return;
    if(decision){setMessage("CONTINUE · PICK START POSITION");setSession(s=>s?{...s,state:{...s.state,phase:"ready"}}:s);setStart(v=>(v+1)%64);setPosition(null);return;}
    setStart(v=>(v+1)%64);setPosition(null);
  };
  const action=async()=>{
    if(busyRef.current||animation||spectating)return;
    if(gameOverMode&&scoreSubmitted)return;
    if(gameOverMode&&!scoreSubmitted){try{setBusy(true);setError("");await submitScore();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}return;}
    if(canStart){try{setBusy(true);setError("");await beginRanked();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}return;}
    const existing=sessionRef.current ?? session;
    if(!existing||!credential)return;
    busyRef.current=true;setBusy(true);setError("");
    // Phase from server, not from local CONTINUE display state.
    const serverDecision=existing.state.phase==="decision";
    // In a successful round: left NEXT/CONTINUE unlocks a new RUN; right immediately BANKs.
    // Keep continuation as local UI state without lying to the server.
    const continueMode= !decision && serverDecision;
    const verb=(serverDecision&&!continueMode)?"bank":"run";
    try{
      const result=await readJSON<{session:Session;startPosition?:number;steps?:number;landing?:number;hit?:boolean;earned?:number;banked?:number}>(`${API}/sessions/${existing.sessionId}/${verb}`,{
        method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${tokenRef.current}`},
        body:JSON.stringify(verb==="run"?{startPosition:start}:{})
      });
      if(verb==="run"&&result.startPosition!==undefined&&result.steps!==undefined&&result.landing!==undefined){
        await animate({start:result.startPosition,steps:result.steps,landing:result.landing,hit:!!result.hit,earned:result.earned??0});
      }else setMessage(`BANKED ${result.banked??0} POINTS`);
      sessionRef.current=result.session;setSession(result.session);
      if(result.session.status!=="playing")setMessage(`GAME OVER · ${result.session.state.totalPoints} POINTS`);
      else if(result.session.state.phase==="ready"&&verb==="run")setMessage(result.hit?"NEXT ROUND":"MISS · NEXT ROUND");
      setPosition(null);
    }catch(e){setError(e instanceof Error?e.message:"Could not submit action");try{await syncPublic(existing.sessionId);}catch{}}
    finally{busyRef.current=false;setBusy(false);}
  };
  const watch=(id:string)=>{
    spectatorRef.current=true;setSpectating(true);setPosition(null);setMessage("WATCHING LIVE GAME");
    window.history.replaceState({},"",`/game?watch=${encodeURIComponent(id)}`);
    void syncPublic(id).catch(e=>setError(String(e)));
  };
  const backToPlayer=()=>{
    spectatorRef.current=false;setSpectating(false);setSession(null);sessionRef.current=null;setPosition(null);
    window.history.replaceState({},"","/game");
    const id=window.sessionStorage.getItem("face64-ranked-id");
    if(id){tokenRef.current=window.sessionStorage.getItem("face64-ranked-token")||"";setCredential(tokenRef.current);void syncPublic(id).catch(()=>{});}
  };
  const visiblePosition=position===null?pathIndex(start):position;
  // Preserve Space/Enter as actual buttons; never hijack typing in the identity fields.
  const moveRef=useRef<() => void>(()=>{});
  const actionRef=useRef<() => Promise<void>>(async()=>{});
  useEffect(()=>{
    moveRef.current=move;
    actionRef.current=action;
  });
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.repeat||e.altKey||e.ctrlKey||e.metaKey)return;
      const el=e.target as HTMLElement|null;
      if(el && (el.tagName==="INPUT"||el.tagName==="SELECT"||el.tagName==="TEXTAREA"||el.isContentEditable))return;
      if(e.code==="Space"){e.preventDefault();moveRef.current();}
      if(e.code==="Enter"){e.preventDefault();void actionRef.current();}
    };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[]);
  const deadline=session?.status==="playing"?Math.min(session.inactivityDeadline,session.dayEnd):null;
  const remaining=deadline && now?Math.max(0,deadline-now):null;
  const dailyRemaining=daily&&now?Math.max(0,Date.parse(daily.tournamentEnd)-now):null;
  const leftLabel=decision?"CONTINUE": "NEXT PIXEL →";
  const rightLabel=gameOverMode?(scoreSubmitted?"SCORE ON CHAIN":"SUBMIT SCORE"):canStart?(!wallet?"CONNECT WALLET":!entered?(allowance<fee?"APPROVE OCH":"ENTER 100 OCH"):"START GAME"):decision?"BANK":animation?"SPINNING…":"RUN";
  return <div className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.brand}>64 FACES</Link><nav><Link href="/">← COLLECTION</Link><span>FACE64 / ARCADE</span></nav></header>
    <main className={styles.shell}>
      <div className={styles.intro}><div className={styles.eyebrow}>DAILY ARCADE / EIGHT ROUNDS / TWO BUTTONS</div><h1>FACE64<span className={styles.dot}>.</span></h1><p>CHOOSE YOUR START · RUN THE ROULETTE · BANK OR RISK YOUR SCORE</p></div>
      <div className={styles.layout}>
        <aside className="f64-rail f64-rail-live" aria-label="Active games">
          <div className={styles.panel}><div className={styles.panelTitle}>[ LIVE GAMES ] <span className="f64-live-count">{activeLive.length} ACTIVE</span></div>{activeLive.length?activeLive.slice(0,12).map(item=><button className={styles.row} key={item.sessionId} onClick={()=>watch(item.sessionId)}><span>{item.collection==="face"?"FACE":"HOODIE"} #{item.tokenId}<small>ROUND {Math.min(item.state.round+1,8)}/8 · {item.state.phase==="decision"?"DECIDING":"PLAYING"}</small></span><span>{item.state.totalPoints} PTS ↗</span></button>):<p>NO ACTIVE GAMES<br/><span className="f64-empty-subtitle">WAITING FOR THE NEXT PLAYER.</span></p>}</div>
          <p className="f64-rail-hint">ONLY ACTIVE SESSIONS · UPDATES EVERY 12S</p>
        </aside>
        <section className={styles.machine} aria-label="FACE64 game">
          <div className={styles.hud}><span>{spectating?"WATCHING LIVE":`ROUND ${session?Math.min(current.round+1,8):1} / 8`}</span><span>{session?`FACE #${current.faceId||"—"}`:`FACE #${daily?.faceIds?.[0]??"—"} / PREVIEW`}</span></div>
          {session&&<div className="f64-playing">PLAYING AS {session.identity.collection==="face"?"FACE":"HOODIE"} #{session.identity.tokenId}{spectating?" · SPECTATING":""}</div>}
          <div className={styles.timer}><span>SESSION <strong>{remaining!==null?timeLeft(remaining):"04:00"}</strong></span><span>DAILY CLOSE <strong>{dailyRemaining!==null?dayClock(dailyRemaining):"--:--"}</strong></span></div>
          <div className={`${styles.frame} f64-game-display`}>
            <div className={styles.board} role="img" aria-label={`FACE64 8×8 board; ${count} lit pixels remaining`}>
              {Array.from({length:N},(_,index)=>{
                const active=lit(screenRows,index);
                const cursor=!showPixelMessage&&!!session&&visiblePosition===index&&current.phase!=="finished";
                const potential=!showPixelMessage&&showOdds&&possibleLandings.includes(index);
                return <div className={`${styles.cell}${potential?(active?" f64-possible-hit":" f64-possible-miss"):""}${cursor?" f64-cursor":""}`} key={index} style={{backgroundColor:showPixelMessage?(active?GREEN:BLACK):(active?previewFg:previewBg),position:"relative",zIndex:cursor?2:potential?1:0}}/>;
              })}
            </div>
          </div>
          <div className="f64-odds" aria-live="polite">
            <span className="f64-odds-label">POSSIBLE LANDINGS <strong>7–13 STEPS</strong></span>
            <strong className="f64-odds-percent">{showOdds?`${probability}%`:"—"}</strong>
            <span className="f64-odds-caption">{showOdds?`${hitCount} OF 7 HIT GREEN` : "SELECT A PLAYER TO SEE YOUR ODDS"}</span>
          </div>
          <div className="f64-legend"><span><i className="f64-legend-start"/> START</span><span><i className="f64-legend-hit"/> POSSIBLE HIT</span><span><i className="f64-legend-miss"/> POSSIBLE MISS</span></div>
          <div className={styles.readout} aria-live="polite">{busy&&!animation?"LOADING…":!session&&preview?"PRESS START GAME TO PLAY":message}</div>
          <div className={styles.stats}><span>HITS <strong>{current.hits}</strong></span><span>AT RISK <strong>{current.roundPoints}</strong></span><span>BANKED <strong>{current.totalPoints}</strong></span></div>
          {session&&<div className={styles.position}>START POSITION <strong>{start}</strong> <span>·</span> LIT PIXELS LEFT <strong>{count}</strong></div>}
          {!session&&!spectating&&wallet&&<div className="f64-wallet">CONNECTED {wallet.slice(0,6)}…{wallet.slice(-4)} · {walletStatus}</div>}
          {!session&&!spectating&&<div className={styles.identity}><label>PLAYER <select value={collection} onChange={e=>setCollection(e.target.value as Identity)}><option value="face">64 FACE</option><option value="hoodie">HOODIE</option></select></label><label>TOKEN # <input type="number" min={collection==="face"?1:0} max={collection==="face"?512:5999} value={tokenId} onChange={e=>setTokenId(Number(e.target.value))}/></label></div>}
          {spectating?<button className={styles.wideButton} onClick={backToPlayer}>← BACK TO MY GAME</button>:<div className={styles.controls}>
            <button type="button" disabled={!gameReady||busy||animation||current.phase==="finished"} onClick={move}>{leftLabel}</button>
            <button type="button" disabled={busy||animation||scoreSubmitted|| (session?.status==="playing"&&current.phase==="finished")} onClick={()=>void action()}>{rightLabel}</button>
          </div>}
          <div className={styles.hint}>SPACE = NEXT / CONTINUE · ENTER = RUN / BANK · {decision?"LEFT = CONTINUE PLAYING. RIGHT = BANK THIS ROUND'S POINTS.":"LEFT = MOVE START POSITION. RIGHT = RUN THE ROULETTE."}</div>
          {error&&<div className={styles.error} role="alert">{error}</div>}
          {session&&<div className={styles.sessionNote}>{session.status==="playing"?"4-MINUTE INACTIVITY LIMIT":"SESSION COMPLETE"} · MAINNET RANKED / OCH ENTRY · {scoreSubmitted?"SCORE RECORDED":"SCORE NOT YET ON CHAIN"}</div>}
        </section>
        <aside className="f64-rail f64-rail-leaders" aria-label="Daily leaderboard">
          <div className={styles.panel}><div className={styles.panelTitle}>[ LEADERBOARD ]</div>{leaders.length?leaders.slice(0,12).map((entry,i)=><button key={entry.sessionId} className={styles.row} onClick={()=>watch(entry.sessionId)}><span>{i+1}. {entry.collection==="face"?"FACE":"HOODIE"} #{entry.tokenId}</span><strong>{entry.score}</strong></button>):<p>NO COMPLETED GAMES YET</p>}</div>
          <p className="f64-rail-hint">DAILY SESSION SCORES · ON-CHAIN RECORDS REQUIRE SUBMISSION</p>
        </aside>
      </div>
      <p className={styles.disclaimer}>MAINNET PILOT · 100 OCH ENTRY · SERVER-CONTROLLED ROULETTE IS NOT INDEPENDENTLY VERIFIABLE · PRIVATE TESTING ONLY.</p>
    </main>
  </div>;
}
