import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lunchdags",
  description: "Välj lunchställe, sätt betyg och hitta gruppens favoriter.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
