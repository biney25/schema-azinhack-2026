import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Schema — Your private journal",
  description: "A photo journal for the little things. Keep pages, revisit your life, and share with your closest people.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
