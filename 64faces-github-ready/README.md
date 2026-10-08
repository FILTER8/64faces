# 64 Faces

A 1-bit on-chain art explorer for **64 Faces**, on Robinhood Chain.

- Gallery with seven trait filters, rarity, and filtered grid PNG export
- Individual pixel-perfect PNG exports
- ESP32-compatible API at `/api/face/{id}`
- Strictly `#000000` and `#CCFF00`, with Departure Mono
- No wallet connection or minting

## Local setup

```bash
npm install
npm run dev
```

## Configuration

No Alchemy key is required: this site reads the Robinhood Chain contract using JSON-RPC directly. By default it uses the public URL declared in `lib/faces.ts`.

If you prefer a private RPC for production, create `.env.local` (already ignored by Git) with:

```dotenv
ROBINHOOD_RPC_URL=https://your-private-robinhood-rpc
```

Set the same **server-side** environment variable in the deployment platform. Do not prefix it with `NEXT_PUBLIC_`. Do not commit keys.

## Deploy

Connect the repository to Vercel, set the custom domain `64faces.filter8.xyz`, and add the DNS records shown by Vercel at your DNS host.
