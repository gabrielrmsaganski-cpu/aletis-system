import type { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/siteConfig'
import { insights } from '@/lib/insights'
import { flattenTree } from '@/components/educacao/eduTree'

const STATIC_ROUTES = [
  { path: '', priority: 1.0, changeFrequency: 'weekly' as const },
  { path: 'sobre', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: 'solucoes', priority: 0.9, changeFrequency: 'monthly' as const },
  { path: 'cases', priority: 0.95, changeFrequency: 'monthly' as const },
  { path: 'para-quem-e', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: 'calculadoras', priority: 0.85, changeFrequency: 'monthly' as const },
  { path: 'calculadoras/reestruturacao', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: 'calculadoras/capacidade-safra', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: 'calculadoras/abusividade', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: 'insights', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: 'glossario', priority: 0.7, changeFrequency: 'yearly' as const },
  { path: 'contato', priority: 0.9, changeFrequency: 'yearly' as const },
  { path: 'politica-privacidade', priority: 0.4, changeFrequency: 'yearly' as const },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url.replace(/\/$/, '')
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: r.path ? `${base}/${r.path}` : base,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  const insightEntries: MetadataRoute.Sitemap = insights.map((i) => ({
    url: `${base}/insights/${i.slug}`,
    lastModified: new Date(i.publicadoEm),
    changeFrequency: 'yearly',
    priority: 0.7,
  }))

  // Educação — todas as rotas derivadas do eduTree (mapa + 7 hubs + 24 sub-tópicos)
  const eduEntries: MetadataRoute.Sitemap = flattenTree().map((node) => {
    // hub = /educacao/<x> (2 segmentos após raiz); subtópico = mais profundo
    const segs = node.href.split('/').filter(Boolean)
    const isHub = segs.length === 2
    return {
      url: `${base}${node.href}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: isHub ? 0.85 : 0.75,
    }
  })

  return [
    ...staticEntries,
    { url: `${base}/educacao`, lastModified: now, changeFrequency: 'monthly', priority: 0.95 },
    ...eduEntries,
    ...insightEntries,
  ]
}
