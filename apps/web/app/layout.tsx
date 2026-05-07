import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "sonner";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-jb",
});

export const metadata: Metadata = {
  title: "chess.edge — real-time chess on the edge",
  description: "Production-grade multiplayer chess. Server-authoritative, hibernatable, fast.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#22d3ee",
          colorBackground: "#0a0e1a",
          colorText: "#e5ecff",
          colorInputBackground: "#0f1424",
          colorInputText: "#e5ecff",
          borderRadius: "0.5rem",
        },
      }}
    >
      <html lang="en" data-theme="midnight" suppressHydrationWarning>
        <body className={`${geist.variable} ${mono.variable} font-sans antialiased min-h-screen`}>
          <ThemeProvider>
            <SiteHeader />
            <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
            <Toaster theme="dark" position="bottom-right" />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
