/**
 * App (Roteamento Raiz)
 *
 * Ponto de entrada de rotas do sistema ALETIS. Portal do Cliente
 * (/portal-cliente) usa layout independente (sem sidebar). Demais
 * rotas sao agrupadas dentro do Layout completo com lazy-loading
 * e Suspense para reduzir bundle inicial.
 */
import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import CRM from './pages/CRM'

// Heavy pages — lazy-loaded. Bundles pesados (Leaflet, Chart.js, markdown, etc)
// só chegam ao cliente quando a rota correspondente é visitada.
const ClienteDetalhes = lazy(() => import('./pages/ClienteDetalhes'))
const ClienteDossie = lazy(() => import('./pages/ClienteDossie'))
const Propostas = lazy(() => import('./pages/Propostas'))
const Contratos = lazy(() => import('./pages/Contratos'))
const Mercado = lazy(() => import('./pages/Mercado'))
const Credito = lazy(() => import('./pages/Credito'))
const WhatsApp = lazy(() => import('./pages/WhatsApp'))
const PortalCliente = lazy(() => import('./pages/PortalCliente'))
const Clima = lazy(() => import('./pages/Clima'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))
const ALIX = lazy(() => import('./pages/ALIX'))
const Prospeccao = lazy(() => import('./pages/Prospeccao'))
const Financeiro = lazy(() => import('./pages/Financeiro'))
const CusteioAgricola = lazy(() => import('./pages/CusteioAgricola'))
const Ferramentas = lazy(() => import('./pages/Ferramentas'))

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-20 text-aletis-grafite-medio dark:text-white/60">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-aletis-dourado" />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Portal do Cliente — layout independente, sem sidebar */}
      <Route
        path="/portal-cliente"
        element={
          <Suspense fallback={<RouteFallback />}>
            <PortalCliente />
          </Suspense>
        }
      />

      {/* Rotas do sistema — com Layout completo (sidebar + header + ticker) */}
      <Route
        path="/*"
        element={
          <Layout>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/crm" element={<CRM />} />
                <Route path="/clientes/:id" element={<ClienteDetalhes />} />
                <Route path="/clientes/:id/dossie" element={<ClienteDossie />} />
                <Route path="/propostas" element={<Propostas />} />
                <Route path="/contratos" element={<Contratos />} />
                <Route path="/mercado" element={<Mercado />} />
                <Route path="/credito" element={<Credito />} />
                <Route path="/whatsapp" element={<WhatsApp />} />
                <Route path="/ia" element={<ALIX />} />
                <Route path="/prospeccao" element={<Prospeccao />} />
                <Route path="/financeiro" element={<Financeiro />} />
                <Route path="/custeio" element={<CusteioAgricola />} />
                <Route path="/custeio/:id" element={<CusteioAgricola />} />
                <Route path="/relatorios" element={<Relatorios />} />
                <Route path="/clima" element={<Clima />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
                <Route path="/ferramentas" element={<Ferramentas />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </Layout>
        }
      />
    </Routes>
  )
}
