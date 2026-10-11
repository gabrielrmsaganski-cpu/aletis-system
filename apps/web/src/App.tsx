/**
 * App (Roteamento Raiz)
 *
 * Ponto de entrada de rotas do sistema ALETIS. Portal do Cliente
 * (/portal-cliente) usa layout independente (sem sidebar). Demais
 * rotas sao agrupadas dentro do Layout completo com lazy-loading
 * e Suspense para reduzir bundle inicial.
 */
import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './components/layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import { useAuth } from './contexts/AuthContext'
import { SkeletonPage } from './components/ui/Skeleton'

// Todas as páginas lazy-loaded. Recharts/jspdf/leaflet ficam fora do
// bundle inicial — Vite faz code-split automático por entrypoint lazy.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CRM = lazy(() => import('./pages/CRM'))
const Login = lazy(() => import('./pages/Login'))

// Heavy pages — lazy-loaded. Bundles pesados (Leaflet, Chart.js, markdown, etc)
// só chegam ao cliente quando a rota correspondente é visitada.
const ClienteWorkspace = lazy(() => import('./pages/ClienteWorkspace'))
const ClienteDossie = lazy(() => import('./pages/ClienteDossie'))
const ClienteDossieVivo = lazy(() => import('./pages/ClienteDossieVivo'))
const Propostas = lazy(() => import('./pages/Propostas'))
const Contratos = lazy(() => import('./pages/Contratos'))
const ContratosOficiais = lazy(() => import('./pages/ContratosOficiais'))
const DealRoom = lazy(() => import('./pages/DealRoom'))
const Negociacoes = lazy(() => import('./pages/Negociacoes'))
const Mercado = lazy(() => import('./pages/Mercado'))
const Credito = lazy(() => import('./pages/Credito'))
const WhatsApp = lazy(() => import('./pages/WhatsApp'))
const PortalCliente = lazy(() => import('./pages/PortalCliente'))
const Clima = lazy(() => import('./pages/Clima'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))
const ALIX = lazy(() => import('./pages/ALIX'))
const Prospeccao = lazy(() => import('./pages/Prospeccao'))
const ProspeccaoMapa = lazy(() => import('./pages/ProspeccaoMapa'))
const Financeiro = lazy(() => import('./pages/Financeiro'))
const AdmCanarana = lazy(() => import('./pages/AdmCanarana'))
const AdmAletis = lazy(() => import('./pages/AdmAletis'))
const ClienteChecklist = lazy(() => import('./pages/ClienteChecklist'))
const CarteiraConsultor = lazy(() => import('./pages/CarteiraConsultor'))
const CusteioAgricola = lazy(() => import('./pages/CusteioAgricola'))
const SimuladorOperacao = lazy(() => import('./pages/SimuladorOperacao'))
const RecalculoAcordo = lazy(() => import('./pages/RecalculoAcordo'))
const PlanilhasAletis = lazy(() => import('./pages/PlanilhasAletis'))
const DossiesBancarios = lazy(() => import('./pages/DossiesBancarios'))
const Ferramentas = lazy(() => import('./pages/Ferramentas'))
const CalculadorasAgro = lazy(() => import('./pages/CalculadorasAgro'))
const Fontes = lazy(() => import('./pages/Fontes'))
const ManualMarca = lazy(() => import('./pages/ManualMarca'))
const NotFound = lazy(() => import('./pages/NotFound'))

function RouteFallback() {
  return (
    <div role="status" aria-label="Carregando página" className="py-2">
      <SkeletonPage />
    </div>
  )
}

function AuthFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-aletis-verde-profundo" role="status" aria-label="Validando sessão">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-aletis-sage/25 border-t-aletis-gold" />
    </div>
  )
}

function LoginRoute() {
  const { status } = useAuth()
  if (status === 'loading') return <AuthFallback />
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />
  return (
    <Suspense fallback={<AuthFallback />}>
      <Login />
    </Suspense>
  )
}

function ProtectedApplication() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <AuthFallback />
  if (status !== 'authenticated') {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from }} />
  }

  return (
    <Layout>
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/crm" element={<CRM />} />
            <Route path="/crm-canarana" element={<Navigate to="/crm?escritorio=Canarana" replace />} />
            <Route path="/clientes/:id" element={<ClienteWorkspace />} />
            <Route path="/clientes/:id/dossie-vivo" element={<ClienteDossieVivo />} />
            <Route path="/clientes/:id/dossie" element={<ClienteDossie />} />
            <Route path="/clientes/:id/checklist" element={<ClienteChecklist />} />
            <Route path="/clientes/:id/deal-room" element={<DealRoom />} />
            {/* Rotas legadas redirecionadas — manter URLs antigas válidas. */}
            <Route path="/clientes/:id/command-center" element={<Navigate to="../" replace />} />
            <Route path="/clientes/:id/legacy" element={<Navigate to="../" replace />} />
            <Route path="/negociacoes" element={<Negociacoes />} />
            <Route path="/propostas" element={<Propostas />} />
            <Route path="/contratos" element={<Contratos />} />
            <Route path="/contratos-oficiais" element={<ContratosOficiais />} />
            <Route path="/mercado" element={<Mercado />} />
            <Route path="/credito" element={<Credito />} />
            <Route path="/whatsapp" element={<WhatsApp />} />
            <Route path="/ia" element={<ALIX />} />
            <Route path="/prospeccao" element={<Prospeccao />} />
            <Route path="/prospeccao/mapa" element={<ProspeccaoMapa />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/adm-canarana" element={<AdmCanarana />} />
            <Route path="/adm-aletis" element={<AdmAletis />} />
            <Route path="/carteira" element={<CarteiraConsultor />} />
            <Route path="/custeio" element={<CusteioAgricola />} />
            <Route path="/custeio/:id" element={<CusteioAgricola />} />
            <Route path="/planilhas-aletis" element={<PlanilhasAletis />} />
            <Route path="/dossies-bancarios" element={<DossiesBancarios />} />
            <Route path="/simulador-operacao" element={<SimuladorOperacao />} />
            <Route path="/recalculos-acordo" element={<RecalculoAcordo />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/clima" element={<Clima />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/configuracoes/marca" element={<ManualMarca />} />
            <Route path="/ferramentas" element={<Ferramentas />} />
            <Route path="/ferramentas/calculadoras-agro" element={<CalculadorasAgro />} />
            <Route path="/fontes" element={<Fontes />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />

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
        element={<ProtectedApplication />}
      />
    </Routes>
  )
}
