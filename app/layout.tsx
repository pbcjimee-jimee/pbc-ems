import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PBC EMS", template: "%s | PBC EMS" },
  description: "Paint Buddy & Co. operations workspace",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
