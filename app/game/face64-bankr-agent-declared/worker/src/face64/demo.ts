/**
 * FACE64 prototype game engine (NO OCH, NO NFT authorization, NO ranked prizes).
 * Player bearer tokens guard write actions; identities are informational only.
 * Cloudflare Workers + D1. Schema: migrations/face64_demo.sql.
 */

const API = "https://64faces.filter8.xyz/api/face/";
const FACE_COLLECTION = "0xc8e36ae47246e5943da2b228fbaff1fb27a473b0";
const HOODIE_COLLECTION = "0x9ec6c5b9f572a9b02138e553bc5f5882da735f45";
const INACTIVITY_MS = 4 * 60 * 1000;
const ENTRY_CLOSE_MS = 15 * 60 * 1000;
const MAX_GAME_ROUNDS = 8;
// Prototype: only minted 64 Faces can be used for the daily eight boards.
// Update this ceiling as the sequential mint progresses (currently 229).
// Future production: derive eligible token IDs from verified on-chain mint events.
const MAX_MINTED_FACE_ID = 229;
const MAX_EVENT_LIMIT = 100;
const MAX_REQUEST_BYTES = 1024;

type Collection = "face" | "hoodie";
type Status = "playing" | "finished" | "timed_out" | "closed";
type Phase = "ready" | "decision" | "finished";
type State = {
  round: number;
  phase: Phase;
  rows: number[];
  faceId: number;
  hits: number;
  roundPoints: number;
  totalPoints: number;
  lastOutcome: null | { start: number; steps: number; landing: number; hit: boolean; earned: number };
};
type Row = {
  id: string; day: string; collection: Collection; token_id: number;
  secret_hash: string; status: Status; state_json: string; version: number;
  created_at: number; last_action_at: number; finished_at: number | null; runner?: string | null; strategy?: string | null;
};
type Daily = { day: string; seed: string; face_ids_json: string };

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};
function reply(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers });
}
function error(message: string, status = 400): Response { return reply({ error: message }, status); }
function int(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= min && value <= max;
}
function hex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(s: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}
function utcDay(time = Date.now()): string { return new Date(time).toISOString().slice(0, 10); }
function dayEnd(day: string): number { return Date.parse(`${day}T00:00:00.000Z`) + 86400000; }
function bytesToInts(data: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 4) out.push((data[i] * 16777216 + (data[i + 1] << 16) + (data[i + 2] << 8) + data[i + 3]) >>> 0);
  return out;
}
async function daily(db: D1Database, day: string): Promise<{ day: string; seed: string; faceIds: number[] }> {
  const found = await db.prepare("SELECT * FROM face64_demo_daily WHERE day=?").bind(day).first<Daily>();
  if (found) return { day, seed: found.seed, faceIds: JSON.parse(found.face_ids_json) };
  // Public common challenge seed; this is NOT the roulette randomness.
  const seed = await sha256(`FACE64-V1-CHALLENGE|4663|${day}`);
  const numbers = bytesToInts(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${seed}|boards`))));
  const picks: number[] = [];
  let n = 0;
  while (picks.length < MAX_GAME_ROUNDS) {
    if (n >= numbers.length) {
      const more = bytesToInts(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${seed}|${n}`))));
      numbers.push(...more);
    }
    const id = (numbers[n++] % MAX_MINTED_FACE_ID) + 1;
    if (!picks.includes(id)) picks.push(id);
  }
  await db.prepare("INSERT OR IGNORE INTO face64_demo_daily(day,seed,face_ids_json) VALUES(?,?,?)").bind(day, seed, JSON.stringify(picks)).run();
  const stored = await db.prepare("SELECT * FROM face64_demo_daily WHERE day=?").bind(day).first<Daily>();
  if (!stored) throw new Error("Daily challenge could not be initialized");
  return { day, seed: stored.seed, faceIds: JSON.parse(stored.face_ids_json) };
}
async function getArtwork(faceId: number): Promise<number[]> {
  const response = await fetch(`${API}${faceId}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`64 Faces API returned ${response.status} for #${faceId}`);
  const result = await response.json() as { width?: unknown; height?: unknown; rows?: unknown };
  if (result.width !== 8 || result.height !== 8 || !Array.isArray(result.rows) || result.rows.length !== 8 ||
      !result.rows.every(x => int(x, 0, 255))) throw new Error("Invalid Face bitmap from upstream API");
  // The row bits define safe tiles, independently of Classic/Inverted visual palette.
  return result.rows as number[];
}
function snapshot(state: State, row: Row) {
  return { sessionId: row.id, day: row.day, identity: { collection: row.collection, tokenId: row.token_id },
    status: row.status, state, lastActionAt: row.last_action_at, inactivityDeadline: row.last_action_at + INACTIVITY_MS,
    dayEnd: dayEnd(row.day), version: row.version, prototype: true, paid: false, ranked: false, runner: row.runner === "bankr" ? "bankr" : null, strategy: row.runner === "bankr" ? row.strategy ?? null : null, verification: "self_declared" };
}
function cloneState(row: Row): State { return JSON.parse(row.state_json) as State; }
// Read through a helper so TypeScript does not retain stale phase narrowing
// after nextRound mutates the State object.
function isFinished(state: State): boolean { return state.phase === "finished"; }
function pathIndex(step: number): number {
  const pos = step % 64;
  const y = Math.floor(pos / 8);
  return y * 8 + (y % 2 === 0 ? pos % 8 : 7 - pos % 8);
}
function hasPixel(rows: number[], pos: number): boolean {
  const y = Math.floor(pos / 8), x = pos % 8;
  return !!(rows[y] & (128 >> x));
}
function anyPixels(rows: number[]): boolean { return rows.some(row => row !== 0); }
async function finishExpired(db: D1Database, row: Row): Promise<Row> {
  if (row.status !== "playing") return row;
  const now = Date.now();
  const closed = now >= dayEnd(row.day);
  const inactive = now - row.last_action_at >= INACTIVITY_MS;
  if (!closed && !inactive) return row;
  const state = cloneState(row);
  state.roundPoints = 0; state.phase = "finished";
  const status: Status = closed ? "closed" : "timed_out";
  const res = await db.prepare("UPDATE face64_demo_sessions SET status=?,state_json=?,version=version+1,finished_at=? WHERE id=? AND version=? AND status='playing'")
    .bind(status, JSON.stringify(state), now, row.id, row.version).run();
  if (res.meta.changes === 1) {
    await event(db, row.id, "game_end", { status, score: state.totalPoints });
  }
  return (await db.prepare("SELECT * FROM face64_demo_sessions WHERE id=?").bind(row.id).first<Row>()) ?? row;
}
async function event(db: D1Database, session: string, type: string, payload: unknown): Promise<void> {
  await db.prepare("INSERT INTO face64_demo_events(session_id,event_type,payload_json,created_at) VALUES(?,?,?,?)")
    .bind(session, type, JSON.stringify(payload), Date.now()).run();
}
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (raw.length > MAX_REQUEST_BYTES) return null;
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
  } catch { return null; }
}
async function privateSession(request: Request, db: D1Database, id: string): Promise<Row | Response> {
  const secret = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (!secret) return error("Session bearer token required", 401);
  const row = await db.prepare("SELECT * FROM face64_demo_sessions WHERE id=?").bind(id).first<Row>();
  if (!row) return error("Session not found", 404);
  if (await sha256(secret.toLowerCase()) !== row.secret_hash) return error("Invalid session token", 403);
  return await finishExpired(db, row);
}
async function publicSession(db: D1Database, id: string): Promise<Response> {
  const row = await db.prepare("SELECT * FROM face64_demo_sessions WHERE id=?").bind(id).first<Row>();
  if (!row) return error("Session not found", 404);
  const fresh = await finishExpired(db, row);
  return reply(snapshot(cloneState(fresh), fresh));
}
async function nextRound(db: D1Database, day: string, state: State): Promise<void> {
  state.round++;
  state.roundPoints = 0;
  state.hits = 0;
  state.lastOutcome = null;
  if (state.round >= MAX_GAME_ROUNDS) { state.phase = "finished"; state.rows = []; state.faceId = 0; return; }
  const d = await daily(db, day);
  state.faceId = d.faceIds[state.round];
  state.rows = await getArtwork(state.faceId);
  state.phase = "ready";
}
async function act(request: Request, db: D1Database, id: string, action: "run" | "bank"): Promise<Response> {
  const authorized = await privateSession(request, db, id);
  if (authorized instanceof Response) return authorized;
  const row = authorized;
  if (row.status !== "playing") return error(`Session is ${row.status}`, 409);
  const body = await readBody(request);
  if (!body) return error("Expected a small JSON object");
  const state = cloneState(row);
  const result: Record<string, unknown> = { action };
  if (action === "run") {
    const start = body.startPosition;
    if (!int(start, 0, 63)) return error("startPosition must be an integer from 0 to 63");
    if (state.phase !== "ready" && state.phase !== "decision") return error("RUN is unavailable in this state", 409);
    // Cryptographically random braking distance, chosen only after a valid RUN request.
    // IMPORTANT: secure random draw != publicly verifiable randomness, so production OCH is DISABLED.
    const steps = 7 + crypto.getRandomValues(new Uint32Array(1))[0] % 7;
    const landing = pathIndex(start + steps);
    const hit = hasPixel(state.rows, landing);
    const earned = hit ? Math.pow(2, state.hits) : 0;
    state.lastOutcome = { start, steps, landing, hit, earned };
    if (hit) {
      state.rows[Math.floor(landing / 8)] &= ~(128 >> (landing % 8));
      state.hits++;
      state.roundPoints += earned;
      state.phase = "decision";
      if (!anyPixels(state.rows)) {
        state.totalPoints += state.roundPoints;
        result.autoBank = true;
        await nextRound(db, row.day, state);
      }
    } else {
      state.roundPoints = 0;
      await nextRound(db, row.day, state);
    }
    result.startPosition = start;
    result.steps = steps;
    result.landing = landing;
    result.hit = hit;
    result.earned = earned;
  } else {
    if (state.phase !== "decision") return error("You can BANK only after a HIT", 409);
    result.banked = state.roundPoints;
    state.totalPoints += state.roundPoints;
    await nextRound(db, row.day, state);
  }
  const now = Date.now();
  const finished = isFinished(state);
  const update = await db.prepare("UPDATE face64_demo_sessions SET state_json=?,status=?,version=version+1,last_action_at=?,finished_at=? WHERE id=? AND version=? AND status='playing'")
    .bind(JSON.stringify(state), finished ? "finished" : "playing", now, finished ? now : null, row.id, row.version).run();
  if (update.meta.changes !== 1) return error("Concurrent action detected; refresh and retry", 409);
  await event(db, id, action, { ...result, round: row.day, score: state.totalPoints });
  if (finished) await event(db, id, "game_end", { status: "finished", score: state.totalPoints });
  return reply({ ...result, session: { ...snapshot(state, { ...row, status: finished ? "finished" : "playing", last_action_at: now, version: row.version + 1, finished_at: finished ? now : null }) } });
}
export async function handleFace64Route(request: Request, env: Env, path: string): Promise<Response | null> {
  if (!path.startsWith("/v1/face64")) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const db = env.HOODFRAME_LIKES;
  try {
    if (path === "/v1/face64/demo/daily" && request.method === "GET") {
      const d = await daily(db, utcDay());
      return reply({ ...d, rounds: MAX_GAME_ROUNDS, entryCutoff: new Date(dayEnd(d.day) - ENTRY_CLOSE_MS).toISOString(),
        tournamentEnd: new Date(dayEnd(d.day)).toISOString(), prototype: true, ranked: false });
    }
    if (path === "/v1/face64/demo/sessions" && request.method === "POST") {
      if (Date.now() >= dayEnd(utcDay()) - ENTRY_CLOSE_MS) return error("Demo session creation closed for today", 403);
      const b = await readBody(request);
      if (!b || (b.collection !== "face" && b.collection !== "hoodie")) return error("collection must be face or hoodie");
      const max = b.collection === "face" ? 512 : 6000;
      const min = b.collection === "face" ? 1 : 0;
      if (!int(b.tokenId, min, max - (b.collection === "face" ? 0 : 1))) return error("Invalid tokenId for collection");
      // Runner labels are declarations, not credentials or authorization.
      const runner = b.runner === 'bankr' ? 'bankr' : null;
      const strategy = runner && ['safe','balanced','aggressive'].includes(String(b.strategy)) ? String(b.strategy) : null;
      const d = await daily(db, utcDay());
      const rows = await getArtwork(d.faceIds[0]);
      const state: State = { round: 0, phase: "ready", rows, faceId: d.faceIds[0], hits: 0, roundPoints: 0, totalPoints: 0, lastOutcome: null };
      const id = crypto.randomUUID();
      const secret = hex(crypto.getRandomValues(new Uint8Array(32)));
      const now = Date.now();
      await db.prepare("INSERT INTO face64_demo_sessions(id,day,collection,token_id,secret_hash,status,state_json,version,created_at,last_action_at,runner,strategy) VALUES(?,?,?,?,?,'playing',?,0,?,?,?,?)")
        .bind(id, d.day, b.collection, b.tokenId, await sha256(secret), JSON.stringify(state), now, now, runner, strategy).run();
      await event(db, id, "game_start", { identity: { collection: b.collection, tokenId: b.tokenId }, faceId: state.faceId, runner, strategy, verification: "self_declared" });
      return reply({ ...snapshot(state, { id, day: d.day, collection: b.collection, token_id: b.tokenId, secret_hash: "", status: "playing", state_json: "", version: 0, created_at: now, last_action_at: now, finished_at: null, runner, strategy }),
        sessionToken: secret, warning: "PROTOTYPE ONLY: NFT ownership is NOT verified; NO entry fee or prize is involved. Treat this token like a password." }, 201);
    }
    if (path === "/v1/face64/demo/live" && request.method === "GET") {
      const results = await db.prepare("SELECT id,day,collection,token_id,status,state_json,created_at,last_action_at,runner,strategy FROM face64_demo_sessions WHERE day=? ORDER BY last_action_at DESC LIMIT 30")
        .bind(utcDay()).all<Row>();
      return reply({ day: utcDay(), sessions: (results.results || []).map(r => ({ sessionId: r.id, collection: r.collection, tokenId: r.token_id, status: r.status,
        state: JSON.parse(r.state_json), lastActionAt: r.last_action_at, runner: r.runner === "bankr" ? "bankr" : null, strategy: r.runner === "bankr" ? r.strategy : null, verification: "self_declared" })) });
    }
    if (path === "/v1/face64/demo/leaderboard" && request.method === "GET") {
      const requested=new URL(request.url).searchParams.get('day');
      const queryDay=requested&&/^\d{4}-\d{2}-\d{2}$/.test(requested)?requested:utcDay();
      if(queryDay>utcDay() || Date.parse(queryDay+'T00:00:00Z')<Date.now()-366*86400000)return error('Leaderboard day out of range',400);
      const results = await db.prepare("SELECT id,collection,token_id,status,state_json,finished_at,runner,strategy FROM face64_demo_sessions WHERE day=? AND status IN ('finished','timed_out','closed') ORDER BY finished_at DESC LIMIT 300")
        .bind(queryDay).all<Row>();
      const entries = (results.results || []).map(r => ({ sessionId: r.id, collection: r.collection, tokenId: r.token_id, score: (JSON.parse(r.state_json) as State).totalPoints, status: r.status, runner: r.runner === "bankr" ? "bankr" : null, strategy: r.runner === "bankr" ? r.strategy : null, verification: "self_declared" }))
        .sort((a,b) => b.score - a.score).slice(0,100);
      return reply({ day: queryDay, entries, prototype: true, ranked: false });
    }
    const replayMatch=path.match(/^\/v1\/face64\/demo\/sessions\/([a-f0-9-]{36})\/replay$/);
    if(replayMatch&&request.method==='GET'){
      const id=replayMatch[1];
      const session=await db.prepare('SELECT day,status,runner,strategy FROM face64_demo_sessions WHERE id=?').bind(id).first<{day:string;status:string;runner:string|null;strategy:string|null}>();
      if(!session)return error('Session not found',404);
      const d=await db.prepare('SELECT face_ids_json FROM face64_demo_daily WHERE day=?').bind(session.day).first<{face_ids_json:string}>();
      if(!d)return error('Daily boards not found',404);
      const history=await db.prepare('SELECT event_type,payload_json,created_at FROM face64_demo_events WHERE session_id=? ORDER BY id ASC LIMIT 2001').bind(id).all<{event_type:string;payload_json:string;created_at:number}>();
      const events=history.results||[];
      return reply({sessionId:id,day:session.day,faceIds:JSON.parse(d.face_ids_json),truncated:events.length>2000,runner:session.runner==='bankr'?'bankr':null,strategy:session.strategy,verification:'self_declared',events:events.slice(0,2000).map(e=>({type:e.event_type,payload:JSON.parse(e.payload_json),at:e.created_at}))});
    }
    const match = path.match(/^\/v1\/face64\/demo\/sessions\/([a-f0-9-]{36})(?:\/(run|bank|events))?$/);
    if (match) {
      const [,id,sub] = match;
      if (!sub && request.method === "GET") return publicSession(db,id);
      if (sub === "events" && request.method === "GET") {
        const rows = await db.prepare("SELECT event_type,payload_json,created_at FROM face64_demo_events WHERE session_id=? ORDER BY id DESC LIMIT ?")
          .bind(id, MAX_EVENT_LIMIT).all<{event_type:string;payload_json:string;created_at:number}>();
        return reply({ sessionId:id, events:(rows.results||[]).reverse().map(r=>({type:r.event_type,payload:JSON.parse(r.payload_json),at:r.created_at})) });
      }
      if ((sub === "run" || sub === "bank") && request.method === "POST") return act(request,db,id,sub);
    }
    return error("FACE64 demo endpoint not found", 404);
  } catch (cause) {
    console.error("FACE64 prototype API error", cause);
    return error("FACE64 game engine unavailable. Check D1 migration and upstream Face API.", 503);
  }
}
