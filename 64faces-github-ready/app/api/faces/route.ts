import { NextRequest, NextResponse } from "next/server";
import { getFace, getFirstTokenId, getTotalSupply } from "@/lib/faces";


export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const cursor = params.get("cursor");
  const limitParam = params.get("limit") || "24";
  if (!/^\d{1,4}$/.test(limitParam) || (cursor !== null && !/^\d{1,4}$/.test(cursor))) {
    return NextResponse.json({ error: "Invalid pagination values" }, { status: 400 });
  }
  const limit = Number(limitParam);
  if (limit < 1 || limit > 24) return NextResponse.json({ error: "Limit must be 1–24" }, { status: 400 });

  try {
    const supply = await getTotalSupply();
    const firstTokenId = await getFirstTokenId(supply);
    const start = cursor === null ? firstTokenId : Number(cursor);
    const end = firstTokenId + supply;
    if (start < firstTokenId || start > end) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
    const ids = Array.from({ length: Math.min(limit, end - start) }, (_, index) => start + index);
    const faces = await Promise.all(ids.map((id) => getFace(id)));
    const nextCursor = start + ids.length < end ? start + ids.length : null;
    return NextResponse.json(
      { faces, totalSupply: supply, firstTokenId, nextCursor },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (error) {
    console.error("64 Faces gallery API:", error);
    return NextResponse.json({ error: "Could not load on-chain faces. Please retry." }, { status: 502 });
  }
}
