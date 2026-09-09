import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Benefit Cliff Navigator",
  description: "See how a change in income or a scheme ending affects your caregiver support — for Singapore family caregivers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900 antialiased">{children}</body>
    </html>
  );
}
