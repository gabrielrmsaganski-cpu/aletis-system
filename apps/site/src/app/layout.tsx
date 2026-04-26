import type { Metadata, Viewport } from 'next'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { FloatingChat } from '@/components/layout/FloatingChat'
import { siteConfig } from '@/lib/siteConfig'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.longDescription,
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name }],
  keywords: [
    'reestruturação de dívida rural',
    'consultoria financeira agro',
    'revisional de contrato bancário',
    'CPR',
    'crédito rural',
    'superendividamento produtor rural',
    'inteligência financeira agro',
    'finanças estratégicas',
    'agrobusiness',
    'BPO financeiro',
    'gestão financeira',
    'fomento rural',
    'governança e controles',
    'ALETIS',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.longDescription,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: `${siteConfig.name} — ${siteConfig.tagline}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.longDescription,
    images: [siteConfig.ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: siteConfig.url,
  },
}

export const viewport: Viewport = {
  themeColor: '#17251b',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-aletis-gold focus:px-4 focus:py-2 focus:font-display focus:text-xs focus:font-semibold focus:uppercase focus:tracking-wider2 focus:text-aletis-verde"
        >
          Pular para conteúdo
        </a>
        <Header />
        <main id="conteudo" className="pt-[80px]">
          {children}
        </main>
        <Footer />
        <FloatingChat />
      </body>
    </html>
  )
}
