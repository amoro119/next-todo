// app/layout.tsx
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import { DatabaseProvider } from "@/app/providers";
import { ThemeProvider } from "@/app/providers/ThemeProvider";
import { AppDialogProvider } from "@/lib/hooks/useAppDialog";

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
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "NEXT TODO",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#1e1e24" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${notoSansSC.variable} font-sans antialiased`}>
        <AppDialogProvider>
          <ThemeProvider>
            <DatabaseProvider>
              {children}
            </DatabaseProvider>
          </ThemeProvider>
        </AppDialogProvider>
        <Script id="pwa-sw-register" strategy="afterInteractive">
          {`if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js')})}`}
        </Script>
      </body>
    </html>
  );
}
