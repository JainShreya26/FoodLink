import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import NavGate from "@/components/NavGate";
import DialogProvider from "@/components/Dialog";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FoodLink",
  description: "AI-powered inventory & food sharing for food banks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">
        <DialogProvider>
          <NavGate>
            <Nav />
          </NavGate>
          {/* A flex column so a page can claim the leftover height with
              `flex-1 min-h-0` instead of guessing the chrome with 100vh maths. */}
          <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6">
            {children}
          </main>
        </DialogProvider>
      </body>
    </html>
  );
}
