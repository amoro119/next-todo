// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import ElectricClientProvider from "./electric-client-provider"; // 确认此路径

export const metadata: Metadata = {
  title: "Todo List Local-First",
  description: "A simple local-first todo app built with Next.js and ElectricSQL",
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
        <ElectricClientProvider>
          {children}
        </ElectricClientProvider>
      </body>
    </html>
  );
}