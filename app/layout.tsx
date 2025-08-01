// app/layout.tsx
import type { Metadata } from "next";
import "./globals.scss";
import DbProvider from "./electric-client-provider"; // 现在导入的是 DbProvider

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
        <DbProvider>
          {children}
        </DbProvider>
      </body>
    </html>
  );
}