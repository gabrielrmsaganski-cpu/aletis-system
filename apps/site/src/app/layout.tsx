import type { Metadata, Viewport } from 'next'
import dynamic from 'next/dynamic'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { siteConfig } from '@/lib/siteConfig'
import './globals.css'

// FloatingChat carrega só no cliente — economiza ~12kB do bundle SSR
// e adia inicialização de 7 ícones lucide até depois do paint.
const FloatingChat = dynamic(
  () => import('@/components/layout/FloatingChat').then((m) => m.FloatingChat),
  { ssr: false },
)

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

/**
 * JSON-LD: Organization + ProfessionalService.
 * Empurra ALETIS para conhecer-a-empresa do Google e enriquece preview
 * em buscadores e LinkedIn. Deve ficar no <head> via <script> do tipo
 * application/ld+json para crawlers.
 */
const ORGANIZATION_JSONLD = {
  '@context': 'https://schema.org',
  '@type': ['Organization', 'ProfessionalService'],
  name: 'ALETIS Soluções',
  alternateName: siteConfig.name,
  description: siteConfig.longDescription,
  url: siteConfig.url,
  logo: `${siteConfig.url}/brand/logos/aletis-principal-cream.png`,
  image: `${siteConfig.url}${siteConfig.ogImage}`,
  email: siteConfig.contact.email,
  ...(siteConfig.contact.telefone ? { telephone: siteConfig.contact.telefone } : {}),
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Curitiba',
    addressRegion: 'PR',
    addressCountry: 'BR',
  },
  sameAs: [siteConfig.social.linkedin, siteConfig.social.instagram].filter(Boolean) as string[],
  areaServed: { '@type': 'Country', name: 'Brasil' },
  serviceType: [
    'Consultoria Financeira',
    'Reestruturação de Dívida Rural',
    'Revisional Bancária',
    'BPO Financeiro',
    'Crédito Estruturado',
    'Governança Corporativa',
  ],
  knowsAbout: [
    'crédito rural',
    'CPR',
    'CCB',
    'Funrural',
    'Reforma Tributária',
    'DSCR',
    'Agronegócio',
  ],
  slogan: 'Verdade nos números. Prosperidade nos acordos.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Preload de fontes críticas — reduz FOUT no LCP */}
        <link
          rel="preload"
          href="/fonts/chakra/ChakraPetch-SemiBold.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/chakra/ChakraPetch-Regular.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        {/* JSON-LD Organization + ProfessionalService */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSONLD) }}
        />
      </head>
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
