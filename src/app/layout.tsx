import type { Metadata } from "next";
import { Archivo, Public_Sans } from "next/font/google";
import "./globals.css";
import { BandaPrueba } from "@/components/banda-prueba";

const sans = Public_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], variable: "--font-sans", display: "swap" });
const titulo = Archivo({ subsets: ["latin", "latin-ext"], weight: ["600", "700"], variable: "--font-heading", display: "swap" });

export const metadata: Metadata = {
  title: "CNE 2026",
  description: "Elección del 29 de noviembre de 2026 en el exterior.",
  robots: { index: false, follow: false },
};

export const viewport = { themeColor: "#0a2a5e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${titulo.variable}`}>
      <body>
        <BandaPrueba />
        {children}
      </body>
    </html>
  );
}
