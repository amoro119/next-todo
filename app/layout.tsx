// app/layout.tsx
import type { Metadata } from "next";
import "./globals.scss";
import { DatabaseProvider } from "@/app/providers";

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
      <body>
        <DatabaseProvider>
          {children}
        </DatabaseProvider>
      </body>
    </html>
  );
}