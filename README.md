# 64 Faces — 1-bit on-chain explorer

Drop these files into the matching locations of the **new standalone Next.js 16 project**.

- `app/page.tsx`: client gallery, seven trait filters, rarity rankings, on-chain preview, PNG exports
- `app/globals.css`: strict black / #CCFF00, Departure Mono typography
- `app/layout.tsx`: page metadata
- `app/api/faces/route.ts`: paginated on-chain gallery API
- `app/api/face/[id]/route.ts`: ESP32-ready eight-row byte API
- `lib/faces.ts`: shared server-only Robinhood Chain contract reader
- `public/fonts/DepartureMono-Regular.woff`: your uploaded font

No WalletConnect, Alchemy, Wagmi, or new packages are needed.

## Run

`npm install`
`npm run dev`

Optionally configure a more reliable private server-only Robinhood RPC in `.env.local`:

`ROBINHOOD_RPC_URL=https://your-robinhood-chain-rpc.example`

Do **not** use the NEXT_PUBLIC_ prefix for private URLs or API credentials.

## Important

- Contract address defaults to `0xc8e36ae47246e5943da2b228fbaff1fb27a473b0` on Robinhood Chain (4663).
- The site reads the actual `totalSupply()` and on-chain `tokenURI(uint256)` for every minted token, decoding the embedded SVG rectangles into 8 bytes. It supports token IDs starting at either 0 or 1.
- It may take some time on a public RPC to index all minted faces. Rarity ranks are **not shown until every minted face has loaded**. "Rarest" sorts by descending sum of inverse observed trait frequencies across the seven categories; ties sort by token ID.
- API reads are cached in the server process for 10 minutes. For a production launch with heavy traffic, add a persistent/shared cache and rate limiting.
- If Robinhood's RPC does not support this contract or restricts browser/server traffic, configure `ROBINHOOD_RPC_URL` on the deployment server.
- The actual number of currently minted faces may be lower than the max supply of 512.
- This is a no-mint, read-only explorer.
