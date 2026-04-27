import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "sonner"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: "CPBU assistant",
  description: "장기이식 수술 시간 관리 시스템",
  generator: "v0.dev",
  icons: {
    icon: [
      {
        url: "/favicon.png",
        type: "image/svg+xml",
      },
    ],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className={inter.variable}>
      <head>
        <link rel="icon" href="/favicon.png" type="image/svg+xml" />
      </head>
      <body className="font-sans">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  )
}
