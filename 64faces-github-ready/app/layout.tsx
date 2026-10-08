import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "64 FACES — ON-CHAIN PIXEL ART",
  description: "512 generative 8×8 faces. Two colors. Fully on-chain on Robinhood Chain. Explore traits, rarity, and export pixel-perfect PNGs.",
  metadataBase: new URL("https://64faces.filter8.xyz"),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
