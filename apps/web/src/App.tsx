/**
 * App (Roteamento Raiz)
 *
 * Ponto de entrada de rotas do sistema ALETIS. Portal do Cliente
 * (/portal-cliente) usa layout independente (sem sidebar). Demais
 * rotas sao agrupadas dentro do Layout completo: Dashboard, CRM,
 * Propostas, Prospeccao, Mercado, Credito, WhatsApp, ALIX IA,
 * Prospeccao, Relatorios, Clima e Configuracoes. Rotas
 * desconhecidas redirecionam para /dashboard.
 */
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import CRM from './pages/CRM'
import ClienteDetalhes from './pages/ClienteDetalhes'
import Propostas from './pages/Propostas'
import Mercado from './pages/Mercado'
import Credito from './pages/Credito'
import WhatsApp from './pages/WhatsApp'
import PortalCliente from './pages/PortalCliente'
import Clima from './pages/Clima'
import Relatorios from './pages/Relatorios'
import Configuracoes from './pages/Configuracoes'
import ALIX from './pages/ALIX'
import Prospeccao from './pages/Prospeccao'

export default function App() {
  return (
    <Routes>
      {/* Portal do Cliente — layout independente, sem sidebar */}
      <Route path="/portal-cliente" element={<PortalCliente />} />

      {/* Rotas do sistema — com Layout completo (sidebar + header + ticker) */}
      <Route
        path="/*"
        element={
          <Layout>
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/crm" element={<CRM />} />
              <Route path="/clientes/:id" element={<ClienteDetalhes />} />
              <Route path="/propostas" element={<Propostas />} />
              <Route path="/mercado" element={<Mercado />} />
              <Route path="/credito" element={<Credito />} />
              <Route path="/whatsapp" element={<WhatsApp />} />
              <Route path="/ia" element={<ALIX />} />
              <Route path="/prospeccao" element={<Prospeccao />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/clima" element={<Clima />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  )
}
