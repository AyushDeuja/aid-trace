import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./components/providers";
import { AppNavbar } from "./components/app-navbar";
import { WorkspaceShell } from "./components/workspace-shell";

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
    <html lang="en" suppressHydrationWarning className="font-sans">
      <body suppressHydrationWarning className="antialiased">
        <Providers>
          <AppNavbar />
          <WorkspaceShell>{children}</WorkspaceShell>
        </Providers>
      </body>
    </html>
  );
}
