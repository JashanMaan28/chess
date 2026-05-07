import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { OnboardingGate } from "@/components/onboarding-gate";
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

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "Gambit — quiet, modern chess",
  description: "Calibrated puzzles. Honest opponents. Quiet design.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#1a1815",
          colorBackground: "#faf8f3",
          colorText: "#1a1815",
          colorInputBackground: "#ffffff",
          colorInputText: "#1a1815",
          borderRadius: "0.375rem",
          fontFamily: "var(--font-geist), system-ui, sans-serif",
        },
      }}
    >
      <html lang="en" data-theme="gambit" suppressHydrationWarning>
        <body
          className={`${geist.variable} ${mono.variable} ${serif.variable} font-sans antialiased min-h-screen flex flex-col`}
        >
          <ThemeProvider>
            <OnboardingGate />
            <SiteHeader />
            <main className="flex-1 flex flex-col">{children}</main>
            <Toaster position="bottom-right" />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
