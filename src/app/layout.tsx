import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "BullseyeRL",
  description: "Collaborative real-world city bullseye challenges.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(217,255,102,0.24),transparent_34%),linear-gradient(180deg,#edf4ee,rgba(237,244,238,0.84))]">
          <div className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
