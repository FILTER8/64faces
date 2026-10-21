import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "64 FACES — ON-CHAIN PIXEL ART",
  description: "512 generative 8×8 faces. Two colors. Fully on-chain on Robinhood Chain. Explore traits, rarity, and export pixel-perfect PNGs.",
  metadataBase: new URL("https://64faces.filter8.xyz"),
  openGraph: { title: "64 FACES — ON-CHAIN ARCADE IDENTITIES", description: "512 on-chain 8×8 Faces. Own a Face, play FACE64, claim OCH prizes.", url: "https://64faces.filter8.xyz", siteName: "64 FACES", images: [{ url: "/og.png", width: 1200, height: 630, alt: "64 Faces pixel-art arcade" }], type: "website" },
  twitter: { card: "summary_large_image", title: "64 FACES · FACE64 ARCADE", description: "512 on-chain Faces. Own one, play the game, claim OCH prizes.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
