import type { Metadata } from "next";
import { Literata, Schibsted_Grotesk, Source_Serif_4 } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const literata = Literata({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-literata",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-source-serif",
});

const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
});

export const metadata: Metadata = {
  title: "Marrow",
  description:
    "A density-aware EPUB reader. The whole book is always there — slide to read only the marrow.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${literata.variable} ${sourceSerif.variable} ${schibsted.variable}`}
    >
      <body className="font-sans antialiased min-h-dvh bg-background text-foreground">
        <ThemeProvider
          attribute="data-theme"
          themes={["light", "sepia", "dark"]}
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
