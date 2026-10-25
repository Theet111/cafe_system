import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bean & Board — Cafe OS",
  description: "A cozy command center for your cafe operations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
