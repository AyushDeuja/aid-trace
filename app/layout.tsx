import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./components/providers";
import { SiteHeader } from "./components/site-header";

export const metadata: Metadata = {
  title: "AidTrace",
  description: "Transparent disaster-relief funding on Solana",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased">
        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
