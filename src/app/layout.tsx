import './globals.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import AuthGuard from './AuthGuard'

export const metadata: Metadata = {
  title: 'Contasy Private',
  description: 'Contasy Private',
  robots: { index: false, follow: false }, // sistema interno: fora dos buscadores
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="pt">
      <body>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  )
}
