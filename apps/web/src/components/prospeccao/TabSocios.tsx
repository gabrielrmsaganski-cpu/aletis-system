/**
 * TabSocios — aba "Sócios" do drawer de lead em Prospecção.
 *
 * Extraída de pages/Prospeccao.tsx (Onda B do refactor estrutural).
 * Recebe apenas o lead; nenhum estado próprio. Importa o tipo
 * LeadFull diretamente da página parent (export de tipos).
 */
import { Users } from 'lucide-react'
import type { LeadFull } from '../../pages/Prospeccao'

export function TabSocios({ lead }: { lead: LeadFull }) {
  if (!lead.cnpj) {
    return (
      <div className="text-center py-8 text-aletis-grafite-medio dark:text-white/50">
        <Users size={32} className="mx-auto mb-2 opacity-40" />
        Dados de sócios disponíveis após enriquecimento BrasilAPI.
      </div>
    )
  }
  if (lead.cnpj.socios.length === 0) {
    return (
      <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
        Sem QSA cadastrado.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {lead.cnpj.socios.map((s, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-lg bg-aletis-bege/50 dark:bg-white/5 border border-aletis-borda dark:border-white/10"
        >
          <div className="w-9 h-9 rounded-full bg-aletis-verde/15 flex items-center justify-center">
            <Users size={14} className="text-aletis-verde" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white truncate">
              {s.nome}
            </p>
            <p className="text-[11px] text-aletis-grafite-medio dark:text-white/50">
              {s.qualificacao}
              {s.faixaEtaria && ` · ${s.faixaEtaria}`}
              {s.dataEntrada && ` · desde ${s.dataEntrada}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
