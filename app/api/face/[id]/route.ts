import { NextResponse } from "next/server";
import { getFace, getFirstTokenId, getTotalSupply, isValidTokenId } from "@/lib/faces";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!isValidTokenId(id)) return NextResponse.json({ error: "Invalid token ID" }, { status: 400 });
  try {
    const total = await getTotalSupply();
    const first = await getFirstTokenId(total);
    const value = Number(id);
    if (value < first || value >= first + total) {
      return NextResponse.json({ error: "This face has not been minted" }, { status: 404 });
    }
    const face = await getFace(value);
    return NextResponse.json({
      tokenId: face.id,
      width: 8,
      height: 8,
      rows: face.rows,
      rowsHex: face.rows.map((row) => row.toString(16).padStart(2, "0")),
      bitOrder: "MSB is leftmost pixel",
      foreground: face.foreground,
      background: face.background,
      traits: face.traits,
    }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("64 Faces token API:", error);
    return NextResponse.json({ error: "Could not load this on-chain face" }, { status: 502 });
  }
}
