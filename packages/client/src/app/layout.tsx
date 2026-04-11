import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "将棋倶楽部24 Revival",
  description: "将棋倶楽部24のUXの芯を残した現代Web道場",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-stone-100 text-stone-900">
        {children}
      </body>
    </html>
  );
}
