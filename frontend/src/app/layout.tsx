import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Medical Chatbot",
  description:
    "Ask health questions and get concise answers grounded in an indexed medical reference. Educational use only — not medical advice.",
  applicationName: "Medical Chatbot",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#232a3d" },
    { media: "(prefers-color-scheme: light)", color: "#eef3fa" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme is set before paint by /theme-init.js; suppressHydrationWarning
    // covers the (intentional) attribute difference between server and client.
    <html lang="en" className={inter.variable} data-theme="dark" suppressHydrationWarning>
      <body>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
