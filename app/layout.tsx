import type { Metadata } from "next";
import { Bebas_Neue, Open_Sans } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import SmoothScroll from "@/components/SmoothScroll";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  variable: "--font-bebas",
  subsets: ["latin"],
});

const openSans = Open_Sans({
  variable: "--font-opensans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ASPR Photo Repository",
  description: "ASPR Photo Repository - Administration for Strategic Preparedness and Response",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bebasNeue.variable} ${openSans.variable} antialiased`}>
        <SessionProvider>
          <SmoothScroll>{children}</SmoothScroll>
        </SessionProvider>
      </body>
    </html>
  );
}
