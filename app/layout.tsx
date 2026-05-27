// app/layout.tsx
import type { Metadata } from "next";
import { Inter, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import { DatabaseProvider } from "@/app/providers";
import { ThemeProvider } from "@/app/providers/ThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-sc",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Todo List Local-First",
  description: "A simple local-first todo app built with Next.js and a main-process database",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${notoSansSC.variable} font-sans antialiased`}>
        <ThemeProvider>
          <DatabaseProvider>
            {children}
          </DatabaseProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}