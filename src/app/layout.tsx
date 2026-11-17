import type { Metadata } from "next";
import "./globals.css";
import { BandaPrueba } from "@/components/banda-prueba";

export const metadata: Metadata = {
  title: "CNE 2026",
  description: "Elección del 29 de noviembre de 2026 en el exterior.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <BandaPrueba />
        {children}
      </body>
    </html>
  );
}
