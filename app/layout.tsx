import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rally",
  description:
    "Private planning app for Latter-day Saint youth leaders — activities, attendance, member context, and AI-assisted suggestions tailored to your quorum or class.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
