import type { Metadata } from "next";
import { Fraunces, Noto_Naskh_Arabic, Outfit } from "next/font/google";
import { Nav } from "@/components/Nav";
import { ShiftBanner } from "@/components/ShiftBanner";
import "./globals.css";

const sans = Outfit({ subsets: ["latin"], variable: "--font-sans" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const arabic = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  weight: ["600", "700"],
  variable: "--font-arabic",
});

export const metadata: Metadata = {
  title: "Learn Arabic Academy · Sales desk",
  description: "Standalone sales desk for Learn Arabic Academy reps.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${arabic.variable}`}>
        <div className="app">
          <Nav />
          <div className="main">
            <ShiftBanner />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
