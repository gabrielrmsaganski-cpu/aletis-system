import { PortalMatters } from './portal/PortalMatters'
import { PortalFiscal } from './portal/PortalFiscal'
/**
 * PortalCliente — SPA do cliente final ALETIS.
 *
 * Servida em /portal-cliente sem layout do consultor. Onda 1 desta SPA:
 *   1. Login com senha + magic-link + esqueci-senha
 *   2. Magic redeem + reset de senha via query string (?magic=...|?reset=...)
 *   3. Hero Pulse: o cliente entende em 3s onde o caso está
 *   4. Inbox de documentos pendentes
 *   5. Upload self-service do cliente
 *   6. Badge de mensagens não lidas
 *   7. Cofre digital (uploads enviados)
 *   8. Identidade visual oficial (BrandMark + paleta nova)
 *
 * O conteúdo é 100% derivado da API; nada mockado.
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  LogIn,
  User,
  Lock,
  FileText,
  Download,
  Eye,
  TrendingDown,
  Send,
  CheckCircle2,
  Circle,
  MessageCircle,
  DollarSign,
  Shield,
  AlertCircle,
  LogOut,
  Key,
  Clock,
  Sparkles,
  Inbox,
  Upload as UploadIcon,
  Vault,
  Heart,
  FileCheck2,
  ChevronRight,
  Mail,
  ArrowRight,
  Loader2,
  CheckCheck,
  XCircle,
  PaperclipIcon as Paperclip,
  Bell,
  BellOff,
  Bot,
  BarChart3,
  CalendarDays,
  Files,
  Gauge,
  ListChecks,
  Landmark,
  ArrowUpRight,
} from 'lucide-react'
import BrandMark from '../components/ui/BrandMark'
import { PortalErrorBoundary } from './portal/PortalErrorBoundary'
import { usePortalPush } from '../hooks/usePortalPush'

import {
  TOKEN_KEY,
  CATEGORIA_LABEL,
  type ClienteMe,
  type Contrato,
  type StepperItem,
  type TimelineEventoDTO,
  type DocumentoDTO,
  type MensagemDTO,
  type PulseDTO,
  type PendenciaDTO,
  type UploadDTO,
  type CronogramaDTO,
  type MemoriaSimplificadaDTO,
  type AuditoriaEventoDTO,
  type HonorariosProjecaoDTO,
  type BreakdownCredorDTO,
  type PortalDashboardDTO,
  type PortalCaseIntelligenceDTO,
} from './portal/types'
import {
  formatBRL,
  formatBRLShort,
  formatDateTime,
  formatDate,
  relativeTime,
  fmtBytes,
  apiCall,
  getGreeting,
} from './portal/utils'
import {
  LoginScreen,
  ResetSenhaScreen,
  TrocarSenhaModal,
  ErrorBanner,
} from './portal/Auth'
import { CofreDigital, PortalDocumentPreview } from './portal/Cofre'
import { PortalNavigation } from './portal/PortalNavigation'
import { PortalHome } from './portal/PortalHome'
import { PortalSupport } from './portal/PortalSupport'
import { PortalTimeline } from './portal/PortalTimeline'
import { PortalMessages } from './portal/PortalMessages'
import { PORTAL_VIEWS, PORTAL_VIEW_LABEL, readPortalDestination, portalDestinationParams, type PortalDestination, type PortalView } from './portal/PortalExperienceModel'
import { PendenciasInbox, UploadEspontaneo, PortalUploadQueuePanel } from './portal/Pendencias'
import { usePortalUploadQueue } from './portal/usePortalUploadQueue'
import { usePortalSession } from './portal/usePortalSession'
import { needsClientAction, uploadIsProcessing, sortPortalRequests, portalDateOnly } from './portal/DocumentWorkflow'
import { EconomiaHero } from './portal/EconomiaHero'
import { HonorariosCard } from './portal/HonorariosCard'
import { AlixPortalChat } from './portal/AlixPortalChat'

/* ──────────────────────────────────────────────────────────────
 * STEPPER
 * ──────────────────────────────────────────────────────────── */
function NegotiationProgress({ steps }: { steps: StepperItem[] }) {
  if (steps.length === 0) return null
  return (
    <div className="card-premium min-w-0 p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={14} className="text-aletis-gold-escuro" />
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-aletis-gold-escuro">
          Estágio da Negociação
        </p>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-2">
        {steps.map((s, i) => (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center min-w-[68px]">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                  s.done
                    ? 'bg-aletis-verde-medio text-aletis-cream'
                    : s.current
                    ? 'bg-aletis-gold text-foreground shadow-brand-gold'
                    : 'bg-aletis-cream border border-aletis-cream-escuro text-aletis-verde-claro'
                }`}
              >
                {s.done ? <CheckCircle2 size={16} /> : s.current ? <Circle size={16} fill="currentColor" /> : i + 1}
              </div>
              <p
                className={`mt-2 text-[10.5px] font-display font-medium uppercase tracking-wider text-center leading-tight ${
                  s.current ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {s.label}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-px min-w-[12px] ${s.done ? 'bg-aletis-verde-medio' : 'bg-aletis-cream-escuro'}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * HERO PULSE — onde o cliente está em 3s
 * ──────────────────────────────────────────────────────────── */
function HeroPulse({ pulse, onJumpPendencias, onJumpChat }: {
  pulse: PulseDTO
  onJumpPendencias: () => void
  onJumpChat: () => void
}) {
  const health = pulse.healthScore
  const healthColor = health >= 80 ? 'text-muted-foreground' : health >= 60 ? 'text-aletis-gold-escuro' : 'text-red-600'
  const healthRing = health >= 80 ? 'stroke-aletis-verde-medio' : health >= 60 ? 'stroke-aletis-gold' : 'stroke-red-500'
  const dash = (health / 100) * 264 // 2π · 42

  return (
    <section
      className="relative overflow-hidden rounded-3xl p-7 lg:p-8 text-aletis-cream shadow-brand-lg"
      style={{
        backgroundImage:
          'linear-gradient(135deg, rgba(13,22,17,0.97) 0%, rgba(23,37,27,0.94) 45%, rgba(36,58,44,0.92) 100%), url(/brand/pattern/repetidor.png)',
        backgroundColor: '#0d1611',
        backgroundSize: 'auto, 360px',
        backgroundBlendMode: 'normal, soft-light',
      }}
    >
      {/* Watermark sutil */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -bottom-12 opacity-[0.06]">
        <svg width={300} height={300} viewBox="0 0 64 64" fill="none">
          <rect x="6" y="6" width="52" height="52" rx="2" stroke="#ede9d9" strokeWidth="2.4"/>
          <path d="M19 50 L32 16 L45 50 Z" stroke="#ede9d9" strokeWidth="2.4" />
          <rect x="24" y="36" width="16" height="3.6" fill="#ede9d9"/>
        </svg>
      </span>

      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-aletis-gold/40 bg-aletis-gold/10 px-3 py-1 font-display text-[10.5px] font-semibold uppercase tracking-widest text-aletis-gold">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aletis-gold opacity-65" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-aletis-gold" />
            </span>
            {pulse.estagioAtual.label}
          </div>
          <h2 className="mt-3 font-display text-2xl md:text-3xl font-bold leading-tight text-aletis-cream">
            {pulse.proximoPasso}
          </h2>
          <div className="mt-4 flex items-center gap-2 font-body text-[13px] text-aletis-sage">
            <Clock size={14} />
            Última atualização {relativeTime(pulse.ultimaAtualizacao)}
            {pulse.consultor && (
              <>
                <span className="opacity-40">·</span>
                <span>seu consultor: <span className="text-aletis-cream font-semibold">{pulse.consultor}</span></span>
              </>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <PulseStat label="Pendências" value={pulse.pendencias.pendentes} accent="gold" onClick={pulse.pendencias.pendentes > 0 ? onJumpPendencias : undefined} />
            <PulseStat label="Em revisão" value={pulse.pendencias.aguardandoRevisao} accent="sage" />
            <PulseStat label="Mensagens novas" value={pulse.mensagensNaoLidas} accent={pulse.mensagensNaoLidas > 0 ? 'gold' : 'sage'} onClick={pulse.mensagensNaoLidas > 0 ? onJumpChat : undefined} />
            <PulseStat label="Economia" value={formatBRLShort(pulse.economiaEstimada)} accent="cream" />
          </div>
        </div>

        {/* Health Ring */}
        <div className="hidden lg:flex flex-col items-center self-center">
          <div className="relative w-[120px] h-[120px]">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.10)" strokeWidth="6" fill="none"/>
              <circle
                cx="50" cy="50" r="42"
                strokeWidth="6" fill="none" strokeLinecap="round"
                className={healthRing}
                stroke="currentColor"
                strokeDasharray={`${dash} 999`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`font-display text-3xl font-bold ${healthColor.replace('text-', 'text-aletis-cream') /* keep cream on dark */}`}>
                {health}%
              </span>
              <span className="font-display text-[9px] uppercase tracking-widest text-aletis-sage mt-0.5">
                <FileCheck2 size={10} className="inline -mt-0.5" /> conferida
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PulseStat({
  label, value, accent, onClick,
}: {
  label: string
  value: number | string
  accent: 'gold' | 'sage' | 'cream'
  onClick?: () => void
}) {
  const accentColor = accent === 'gold' ? 'text-aletis-gold' : accent === 'sage' ? 'text-aletis-sage-claro' : 'text-aletis-cream'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`text-left rounded-xl border border-aletis-sage/15 bg-aletis-cream/[0.04] px-4 py-3 ${
        onClick ? 'hover:border-aletis-gold/45 hover:bg-aletis-cream/[0.08] cursor-pointer transition' : ''
      }`}
    >
      <p className={`font-display text-2xl font-bold tabular-nums ${accentColor}`}>{value}</p>
      <p className="mt-0.5 font-display text-[9.5px] uppercase tracking-widest text-aletis-sage">{label}</p>
    </Tag>
  )
}

function openPortalAlix(prompt?: string) {
  window.dispatchEvent(new CustomEvent('aletis:portal-alix-open', { detail: { prompt } }))
}

function PortalExperienceHero({
  cliente,
  pulse,
  contrato,
  inteligencia,
  onJumpPendencias,
  onJumpChat,
}: {
  cliente: ClienteMe
  pulse: PulseDTO | null
  contrato: Contrato | null
  inteligencia: PortalCaseIntelligenceDTO | null
  onJumpPendencias: () => void
  onJumpChat: () => void
}) {
  const score = inteligencia?.score ?? pulse?.healthScore ?? null
  const pendentes = pulse?.pendencias.pendentes ?? 0
  const saldo = contrato?.saldoEmAberto ?? null
  const economia = contrato?.economia ?? pulse?.economiaEstimada ?? null
  const perguntaBase = inteligencia?.alix.perguntasSugeridas?.[0] || 'Me explique o status do meu processo em linguagem simples.'

  return (
    <section
      className="relative overflow-hidden rounded-[1.75rem] border border-aletis-sage/20 bg-[#0d1611] text-aletis-cream shadow-2xl"
      style={{
        backgroundImage:
          'linear-gradient(135deg, rgba(13,22,17,0.98), rgba(25,43,31,0.96) 48%, rgba(48,68,49,0.92)), url(/brand/pattern/repetidor.png)',
        backgroundSize: 'auto, 360px',
        backgroundBlendMode: 'normal, soft-light',
      }}
    >
      <div className="relative grid gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-aletis-gold/40 bg-aletis-gold/10 px-3 py-1 font-display text-[10px] font-bold uppercase tracking-widest text-aletis-gold">
              <span className="h-1.5 w-1.5 rounded-full bg-aletis-gold" />
              Portal privado ALETIS
            </span>
            {pulse?.estagioAtual.label && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-body text-[11px] font-semibold text-aletis-sage-claro">
                {pulse.estagioAtual.label}
              </span>
            )}
          </div>
          <h1 className="mt-4 max-w-3xl font-display text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
            {getGreeting()}, {cliente.nome.split(' ')[0]}. Vamos acompanhar seu atendimento.
          </h1>
          <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-aletis-sage-claro">
            {inteligencia?.resumo || pulse?.proximoPasso || 'Acompanhe próximos passos, documentos, negociação, pagamentos e mensagens com a ALETIS em tempo real.'}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PortalHeroMetric icon={Gauge} label="Documentação conferida" value={score === null ? 'A confirmar' : `${score}%`} hint={inteligencia?.nivel || 'em leitura'} tone={(score ?? 0) >= 70 ? 'good' : 'warn'} />
            <PortalHeroMetric icon={Files} label="Documentos" value={inteligencia ? `${inteligencia.documentos.total}` : 'A confirmar'} hint={!pulse ? 'atualizando pedidos' : pendentes ? `${pendentes} pendente(s)` : 'sem pendência aberta'} tone={pendentes ? 'warn' : 'good'} onClick={pendentes ? onJumpPendencias : undefined} />
            <PortalHeroMetric icon={Landmark} label="Saldo aberto" value={saldo === null ? 'A confirmar' : formatBRLShort(saldo)} hint={contrato?.credor || cliente.credor || 'credor principal'} tone="neutral" />
            <PortalHeroMetric icon={TrendingDown} label="Economia" value={economia === null ? 'A confirmar' : formatBRLShort(economia)} hint="mapeada no caso" tone={(economia ?? 0) > 0 ? 'good' : 'neutral'} />
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => openPortalAlix(perguntaBase)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-aletis-gold px-4 py-3 font-display text-sm font-bold text-foreground shadow-brand-gold transition hover:bg-aletis-gold-claro"
            >
              <Bot className="h-4 w-4" /> Perguntar à ALIX sobre meu caso
            </button>
            <button
              type="button"
              onClick={onJumpChat}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-display text-sm font-semibold text-aletis-cream transition hover:bg-white/10"
            >
              <MessageCircle className="h-4 w-4" /> Falar com consultor
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-aletis-gold text-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold text-white">ALIX acompanha este processo</p>
              <p className="mt-1 font-body text-xs leading-relaxed text-aletis-sage-claro">
                {inteligencia?.alix.resumo || 'Ela usa apenas os dados permitidos do seu portal: documentos, pendências, histórico, valores e mensagens do seu caso.'}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {(inteligencia?.alix.perguntasSugeridas ?? [
              'Qual é o status do meu processo?',
              'Quais documentos faltam?',
              'Qual é o próximo passo?',
            ]).slice(0, 4).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => openPortalAlix(q)}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-left transition hover:border-aletis-gold/50 hover:bg-aletis-gold/10"
              >
                <span className="font-body text-xs font-semibold leading-snug text-aletis-cream">{q}</span>
                <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-aletis-gold opacity-70 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function PortalHeroMetric({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: string
  hint: string
  tone: 'good' | 'warn' | 'neutral'
  onClick?: () => void
}) {
  const toneClass = tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-aletis-gold' : 'text-aletis-cream'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`min-w-0 rounded-2xl border border-white/10 bg-white/[0.055] p-4 text-left ${onClick ? 'transition hover:border-aletis-gold/50 hover:bg-white/[0.09]' : ''}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${toneClass}`} />
        <p className="truncate font-display text-[10px] font-bold uppercase tracking-widest text-aletis-sage">{label}</p>
      </div>
      <p className={`mt-2 truncate font-display text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 truncate font-body text-[11px] text-aletis-sage-claro">{hint}</p>
    </Tag>
  )
}

function CaseIntelligenceBoard({
  inteligencia,
  pendencias,
  uploads,
  onJumpPendencias,
}: {
  inteligencia: PortalCaseIntelligenceDTO | null
  pendencias: PendenciaDTO[]
  uploads: UploadDTO[]
  onJumpPendencias: () => void
}) {
  if (!inteligencia) return null
  const grupos = [
    ['cadastro', 'Cadastro'],
    ['financeiro', 'Financeiro'],
    ['patrimonio', 'Patrimônio'],
    ['juridico', 'Jurídico'],
    ['outros', 'Outros'],
  ] as const
  const maxDocs = Math.max(1, ...grupos.map(([g]) => inteligencia.documentos.porGrupo[g] ?? 0))
  const pendentes = pendencias.filter(needsClientAction).length

  return (
    <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="card-premium overflow-hidden">
        <div className="border-b border-aletis-cream-escuro/60 bg-muted px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-[11px] font-bold uppercase tracking-widest text-aletis-gold-escuro">Inteligência do processo</p>
              <h2 className="mt-1 font-display text-xl font-bold text-foreground">Visão 360 do seu caso</h2>
            </div>
            <div className="rounded-2xl border border-aletis-gold/40 bg-aletis-gold/10 px-4 py-2 text-right">
              <p className="font-display text-[10px] font-bold uppercase tracking-widest text-aletis-gold-escuro">Documentação conferida</p>
              <p className="font-display text-2xl font-bold text-foreground tabular-nums">{inteligencia.score}%</p>
            </div>
          </div>
          <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">{inteligencia.resumo}</p>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <div>
            <p className="font-display text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Documentos por área</p>
            <div className="mt-3 space-y-3">
              {grupos.map(([id, label]) => {
                const total = inteligencia.documentos.porGrupo[id] ?? 0
                return (
                  <div key={id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-body text-xs font-semibold text-foreground">{label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{total}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-aletis-cream-escuro/70">
                      <div className="h-full rounded-full bg-aletis-verde" style={{ width: `${Math.max(4, (total / maxDocs) * 100)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <p className="font-display text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Próximas ações</p>
            <div className="mt-3 space-y-2">
              {inteligencia.proximasAcoes.slice(0, 4).map((acao, index) => (
                <div key={`${acao.titulo}-${index}`} className="rounded-xl border border-aletis-cream-escuro bg-muted px-3 py-2">
                  <p className="font-body text-[13px] font-bold leading-snug text-foreground">{acao.titulo}</p>
                  <p className="mt-0.5 line-clamp-2 font-body text-[11.5px] leading-snug text-muted-foreground">{acao.detalhe}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card-premium p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-[11px] font-bold uppercase tracking-widest text-aletis-gold-escuro">Central de documentos</p>
            <h2 className="mt-1 font-display text-xl font-bold text-foreground">O que precisa da sua atenção</h2>
          </div>
          <Files className="h-5 w-5 text-aletis-gold-escuro" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniPortalStat label="Pendentes" value={pendentes} tone={pendentes ? 'warn' : 'good'} />
          <MiniPortalStat label="Enviados" value={uploads.length} tone="neutral" />
          <MiniPortalStat label="Revisão" value={inteligencia.documentos.revisao.length} tone={inteligencia.documentos.revisao.length ? 'warn' : 'good'} />
        </div>
        {inteligencia.documentos.faltantes.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="font-body text-sm font-bold text-amber-900">Ainda precisamos destes blocos:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {inteligencia.documentos.faltantes.map((item) => (
                <span key={item} className="rounded-full border border-amber-200 bg-card px-2.5 py-1 font-body text-[11px] font-bold text-amber-900">
                  {item}
                </span>
              ))}
            </div>
            <button type="button" onClick={onJumpPendencias} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-aletis-verde px-3 py-2 font-body text-xs font-bold text-white hover:bg-aletis-verde-escuro">
              <UploadIcon className="h-3.5 w-3.5" /> Enviar documentos
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="font-body text-sm font-bold text-emerald-900">Nenhum bloco documental essencial faltante agora.</p>
            <p className="mt-1 font-body text-xs text-emerald-800">Continue acompanhando mensagens e revisões do consultor.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function MiniPortalStat({ label, value, tone }: { label: string; value: number | string; tone: 'good' | 'warn' | 'neutral' }) {
  const cls = tone === 'good' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-aletis-cream-escuro bg-muted text-foreground'
  return (
    <div className={`rounded-xl border px-3 py-2 text-center ${cls}`}>
      <p className="font-display text-xl font-bold tabular-nums">{value}</p>
      <p className="font-display text-[9px] font-bold uppercase tracking-widest opacity-75">{label}</p>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * INBOX DE PENDÊNCIAS
 * ──────────────────────────────────────────────────────────── */
/* ──────────────────────────────────────────────────────────────
 * CRONOGRAMA DE PAGAMENTOS
 * ──────────────────────────────────────────────────────────── */
function CronogramaCard({ cronograma }: { cronograma: CronogramaDTO | null }) {
  if (!cronograma) return null
  if (cronograma.parcelas.length === 0) return <div className="card-premium p-5"><div className="flex items-center gap-2 text-foreground"><CalendarDays size={18} /><h3 className="font-display text-base font-bold">Cronograma de pagamentos</h3></div><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{cronograma.mensagem || 'O plano de pagamentos ainda não foi registrado pela equipe.'}</p></div>
  const proxima = cronograma.parcelas.find((p) => p.status === 'proximo')
  const futuras = cronograma.parcelas.filter((p) => p.status !== 'pago').slice(0, 6)
  const pagas = cronograma.parcelas.filter((p) => p.status === 'pago').length

  return (
    <div className="card-premium p-6">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-aletis-gold/15 border border-aletis-gold/40 flex items-center justify-center">
            <Clock className="w-5 h-5 text-aletis-gold-escuro" />
          </div>
          <div>
            <p className="font-display text-base font-bold text-foreground">Cronograma de pagamentos</p>
            <p className="font-body text-[12.5px] text-muted-foreground">
              {pagas} pagas · {cronograma.totalParcelas - pagas} restantes · parcela média {formatBRL(cronograma.parcelaPadrao)}
            </p>
          </div>
        </div>
        {proxima && (
          <div className="rounded-xl border border-aletis-gold/40 bg-aletis-gold/10 px-4 py-2">
            <p className="font-display text-[10px] uppercase tracking-widest text-aletis-gold-escuro">Próximo vencimento</p>
            <p className="font-display text-lg font-bold text-foreground tabular-nums">
              {formatBRL(proxima.valor)} · <span className="text-aletis-gold-escuro">{formatDate(proxima.vencimento)}</span>
            </p>
          </div>
        )}
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {futuras.map((p) => (
          <li
            key={p.numero}
            className={`rounded-xl border px-4 py-3 flex items-center gap-3 transition ${
              p.status === 'pago' ? 'border-aletis-sage/45 bg-aletis-sage/15' :
              p.status === 'atrasado' ? 'border-red-200 bg-red-50' :
              p.status === 'proximo' ? 'border-aletis-gold/45 bg-aletis-gold/10 shadow-brand-sm' :
              'border-aletis-cream-escuro bg-muted'
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-display font-bold text-sm ${
              p.status === 'pago' ? 'bg-aletis-verde-medio text-aletis-cream' :
              p.status === 'proximo' ? 'bg-aletis-gold text-foreground' :
              'bg-aletis-cream border border-aletis-cream-escuro text-muted-foreground'
            }`}>
              {p.numero}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-bold text-foreground tabular-nums">{formatBRL(p.valor)}</p>
              <p className="font-body text-[11.5px] text-muted-foreground">
                vencimento {formatDate(p.vencimento)}
                {p.status === 'proximo' && <span className="ml-1 text-aletis-gold-escuro font-bold">· próximo</span>}
                {p.status === 'atrasado' && <span className="ml-1 text-red-700 font-bold">· em atraso</span>}
              </p>
            </div>

          </li>
        ))}
      </ul>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * MEMÓRIA DE CÁLCULO SIMPLIFICADA — versão "do leigo"
 * ──────────────────────────────────────────────────────────── */
function MemoriaSimplificada({ memoria }: { memoria: MemoriaSimplificadaDTO | null }) {
  if (!memoria) return null
  const max = Math.max(memoria.original, memoria.atual, memoria.pago, 1)
  const economiaPct = memoria.original > 0 ? Math.round((memoria.economia / memoria.original) * 100) : 0

  return (
    <div className="card-premium p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-aletis-sage/25 border border-aletis-sage/40 flex items-center justify-center">
          <FileText className="w-5 h-5 text-foreground" />
        </div>
        <div>
          <p className="font-display text-base font-bold text-foreground">Como chegamos a esse número</p>
          <p className="font-body text-[12.5px] text-muted-foreground">
            Memória de cálculo em linguagem simples — peça também a versão técnica auditável ao seu consultor.
          </p>
        </div>
      </div>

      {memoria.economia > 0 && (
        <div className="mb-5 rounded-2xl border border-aletis-gold/40 bg-gradient-to-br from-aletis-gold/15 to-aletis-cream-papel px-5 py-4">
          <p className="font-display text-[10.5px] uppercase tracking-widest text-aletis-gold-escuro">
            Você descobriu que devia menos
          </p>
          <p className="mt-1 font-display text-3xl sm:text-4xl font-bold text-foreground tabular-nums">
            {formatBRL(memoria.economia)} <span className="text-base text-aletis-gold-escuro font-semibold">· {economiaPct}%</span>
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {memoria.blocos.map((b) => {
          const w = Math.round((b.valor / max) * 100)
          const accent = b.chave === 'descoberta' ? 'gold' : b.chave === 'pago' ? 'sage' : b.chave === 'plano' ? 'verde' : 'cinza'
          const barCls = accent === 'gold' ? 'bg-aletis-gold' :
            accent === 'sage' ? 'bg-aletis-verde-medio' :
            accent === 'verde' ? 'bg-aletis-verde' :
            'bg-aletis-cream-escuro'
          return (
            <li key={b.chave}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p className="font-display text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {b.titulo}
                </p>
                <p className="font-display text-base font-bold text-foreground tabular-nums">{formatBRL(b.valor)}</p>
              </div>
              <div className="h-1.5 bg-aletis-cream-escuro/60 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.max(2, w)}%` }} />
              </div>
              <p className="mt-1.5 font-body text-[12.5px] leading-snug text-muted-foreground">{b.descricao}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * TRILHA DE AUDITORIA + EXPORT LGPD
 * ──────────────────────────────────────────────────────────── */
const TIPO_LABEL: Record<string, string> = {
  login: 'Você entrou no portal',
  login_falhou: 'Tentativa de login com erro',
  logout: 'Você saiu',
  magic_solicitado: 'Link mágico solicitado',
  magic_consumido: 'Você entrou via link mágico',
  reset_solicitado: 'Reset de senha solicitado',
  reset_concluido: 'Senha redefinida',
  senha_alterada: 'Senha alterada',
  documento_enviado: 'Documento enviado por você',
  mensagem_enviada: 'Mensagem enviada',
  doc_visualizado: 'Documento visualizado',
  pendencia_criada: 'Consultor solicitou um documento',
  pendencia_resolvida: 'Pendência revisada pelo consultor',
}

function AuditoriaTimeline({ eventos, token }: { eventos: AuditoriaEventoDTO[]; token: string }) {
  const [exporting, setExporting] = useState(false)

  async function exportarDados() {
    setExporting(true)
    try {
      const r = await fetch('/api/portal/exportar-meus-dados', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error('falha')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `aletis-meus-dados-${Date.now()}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2_000)
    } finally {
      setExporting(false)
    }
  }

  if (eventos.length === 0) return null

  return (
    <div className="card-premium p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted border border-aletis-cream-escuro flex items-center justify-center">
            <Shield className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-display text-base font-bold text-foreground">Trilha de auditoria</p>
            <p className="font-body text-[12.5px] text-muted-foreground">
              Tudo que aconteceu na sua conta — você sempre pode conferir e baixar (LGPD).
            </p>
          </div>
        </div>
        <button
          onClick={exportarDados}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wider bg-aletis-cream text-foreground border border-aletis-cream-escuro hover:bg-white hover:border-aletis-gold/45 transition disabled:opacity-60"
        >
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {exporting ? 'gerando…' : 'baixar meus dados'}
        </button>
      </div>
      <ol className="relative border-l-2 border-aletis-cream-escuro pl-5 space-y-3 max-h-72 overflow-y-auto custom-scrollbar pr-2">
        {eventos.slice(0, 30).map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[26px] top-1 w-3 h-3 rounded-full bg-aletis-sage border-2 border-white shadow-brand-sm" />
            <p className="font-display text-[10.5px] uppercase tracking-widest text-muted-foreground">
              {formatDateTime(e.criadoEm)} {e.canal ? `· ${e.canal}` : ''}
            </p>
            <p className="mt-0.5 font-body text-[13px] text-foreground">
              {TIPO_LABEL[e.tipo] || e.tipo}
              {e.ip && <span className="ml-2 font-mono text-[11px] text-aletis-verde-claro">{e.ip}</span>}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

type PortalNavAction = {
  id: string
  label: string
  icon: React.ElementType
  onClick: () => void
  badge?: string | number
  primary?: boolean
  active?: boolean
}

function PortalTopNavigation({
  cliente,
  naoLidas,
  onLogout,
  onTrocarSenha,
  actions,
}: {
  cliente: ClienteMe
  naoLidas: number
  onLogout: () => void
  onTrocarSenha: () => void
  actions: PortalNavAction[]
}) {
  return (
    <nav className="sticky top-0 z-30 border-b border-aletis-cream-escuro/70 bg-white/92 shadow-brand-sm backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl flex-col gap-2 px-4 py-2 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-3">
          <BrandMark variant="full" tone="verde" size={28} />
          <div className="flex items-center gap-1 lg:hidden">
            <button
              type="button"
              onClick={onTrocarSenha}
              className="rounded-full p-2 text-muted-foreground hover:bg-aletis-cream"
              title="Trocar senha"
              aria-label="Trocar senha"
            >
              <Key size={15} />
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-full p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-2 overflow-x-auto custom-scrollbar lg:flex lg:justify-center">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                aria-current={action.active ? 'page' : undefined}
                className={`relative inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full px-3 font-display text-[11px] font-bold uppercase tracking-wider transition ${
                  action.primary || action.active
                    ? 'bg-aletis-verde text-white hover:bg-aletis-verde-escuro'
                    : 'border border-aletis-cream-escuro bg-muted text-muted-foreground hover:border-aletis-gold/50 hover:bg-white hover:text-aletis-verde'
                }`}
              >
                <Icon size={13} />
                {action.label}
                {action.badge ? (
                  <span className="ml-0.5 rounded-full bg-aletis-gold px-1.5 py-0.5 text-[10px] leading-none text-foreground">
                    {action.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="hidden min-w-[210px] items-center justify-end gap-2 lg:flex">
          <div className="min-w-0 text-right">
            <p className="truncate font-body text-sm font-bold leading-none text-foreground">{cliente.nome}</p>
            <p className="mt-0.5 font-body text-[11px] leading-none text-muted-foreground">
              {cliente.cidade} · {cliente.uf}
              {naoLidas > 0 ? ` · ${naoLidas} mensagem(ns)` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onTrocarSenha}
            className="rounded-full p-2 text-muted-foreground hover:bg-aletis-cream"
            title="Trocar senha"
            aria-label="Trocar senha"
          >
            <Key size={15} />
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-full p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700"
            title="Sair"
            aria-label="Sair"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </nav>
  )
}

function PortalQuickNav({ actions }: { actions: PortalNavAction[] }) {
  return (
    <div className="sticky top-[72px] z-20 -mx-4 border-y border-aletis-cream-escuro/70 bg-aletis-cream-marfim/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
      <div className="flex gap-2 overflow-x-auto custom-scrollbar">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              className={`inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-xl border px-3 font-body text-xs font-bold shadow-brand-sm ${
                action.active
                  ? 'border-aletis-verde bg-aletis-verde text-white'
                  : 'border-aletis-cream-escuro bg-card text-foreground'
              }`}
            >
              <Icon size={14} className={action.active ? 'text-aletis-gold' : 'text-aletis-gold-escuro'} />
              {action.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PortalModuleSwitch({ actions }: { actions: PortalNavAction[] }) {
  const visible = actions.filter((action) => action.id !== 'alix')
  return (
    <div className="card-premium p-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {visible.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              className={`group flex min-h-[74px] min-w-0 flex-col items-start justify-between rounded-2xl border px-3 py-3 text-left transition ${
                action.active
                  ? 'border-aletis-verde bg-aletis-verde text-white shadow-brand'
                  : 'border-aletis-cream-escuro bg-muted text-foreground hover:border-aletis-gold/50 hover:bg-white'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <Icon className={`h-4 w-4 ${action.active ? 'text-aletis-gold' : 'text-aletis-gold-escuro'}`} />
                {action.badge ? (
                  <span className={`rounded-full px-2 py-0.5 font-display text-[10px] font-bold ${
                    action.active ? 'bg-aletis-gold text-foreground' : 'bg-aletis-gold/20 text-aletis-gold-escuro'
                  }`}>
                    {action.badge}
                  </span>
                ) : null}
              </div>
              <span className="mt-3 font-display text-xs font-bold uppercase tracking-wider">{action.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PortalOverviewBento({
  inteligencia,
  contrato,
  cronograma,
  pendencias,
  mensagens,
  onOpenDocs,
  onOpenFinanceiro,
  onOpenMensagens,
}: {
  inteligencia: PortalCaseIntelligenceDTO | null
  contrato: Contrato | null
  cronograma: CronogramaDTO | null
  pendencias: PendenciaDTO[]
  mensagens: MensagemDTO[]
  onOpenDocs: () => void
  onOpenFinanceiro: () => void
  onOpenMensagens: () => void
}) {
  const pendentes = pendencias.filter(needsClientAction)
  const proximaParcela = cronograma?.parcelas.find((p) => p.status === 'proximo')
  const ultimasMensagens = mensagens.slice(-3).reverse()
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <div className="grid gap-4 md:grid-cols-2">
        <PortalBentoCard
          icon={ListChecks}
          eyebrow="Próximo passo"
          title={inteligencia?.proximasAcoes?.[0]?.titulo || 'Acompanhar atualizações do consultor'}
          body={inteligencia?.proximasAcoes?.[0]?.detalhe || 'Quando houver uma nova ação importante, ela aparece aqui com explicação simples.'}
          actionLabel="Perguntar à ALIX"
          onAction={() => openPortalAlix('Qual é o próximo passo do meu processo?')}
          featured
        />
        <PortalBentoCard
          icon={Files}
          eyebrow="Documentos"
          title={pendentes.length ? `${pendentes.length} pendência(s) aberta(s)` : 'Documentos em dia'}
          body={pendentes.length ? 'Revise o que falta enviar e acompanhe a conferência dos arquivos já anexados.' : 'Não há pendência documental aberta no momento.'}
          actionLabel="Abrir documentos"
          onAction={onOpenDocs}
        />
        <PortalBentoCard
          icon={Landmark}
          eyebrow="Financeiro"
          title={contrato ? `${formatBRLShort(contrato.saldoEmAberto)} em aberto` : 'Números em carregamento'}
          body={proximaParcela ? `Próxima parcela: ${formatBRL(proximaParcela.valor)} em ${formatDate(proximaParcela.vencimento)}.` : 'Consulte saldo, economia, honorários e memória do cálculo.'}
          actionLabel="Ver financeiro"
          onAction={onOpenFinanceiro}
        />
        <PortalBentoCard
          icon={Bot}
          eyebrow="ALIX"
          title="Entenda tudo sem juridiquês"
          body="A ALIX responde sobre seu processo usando apenas os dados autorizados do seu portal."
          actionLabel="Conversar agora"
          onAction={() => openPortalAlix('Me dê um resumo simples e completo do meu processo.')}
        />
      </div>
      <div className="card-premium overflow-hidden">
        <div className="border-b border-aletis-cream-escuro bg-muted px-4 py-3">
          <p className="font-display text-[11px] font-bold uppercase tracking-widest text-aletis-gold-escuro">Resumo rápido</p>
          <h3 className="mt-1 font-display text-lg font-bold text-foreground">Últimos sinais do portal</h3>
        </div>
        <div className="space-y-3 p-4">
          {ultimasMensagens.length > 0 ? (
            ultimasMensagens.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={onOpenMensagens}
                className="w-full rounded-xl border border-aletis-cream-escuro bg-card px-3 py-2 text-left hover:border-aletis-gold/50"
              >
                <p className="font-body text-xs font-bold text-foreground">{m.autorNome}</p>
                <p className="mt-0.5 line-clamp-2 font-body text-[12px] leading-snug text-muted-foreground">{m.texto}</p>
              </button>
            ))
          ) : (
            <p className="rounded-xl border border-aletis-cream-escuro bg-card px-3 py-3 font-body text-sm text-muted-foreground">
              Nenhuma mensagem recente. Use o chat quando quiser falar com o consultor.
            </p>
          )}
          <button
            type="button"
            onClick={onOpenMensagens}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-aletis-verde px-3 py-2.5 font-body text-sm font-bold text-white hover:bg-aletis-verde-escuro"
          >
            <MessageCircle className="h-4 w-4" /> Abrir conversa
          </button>
        </div>
      </div>
    </div>
  )
}

function PortalBentoCard({
  icon: Icon,
  eyebrow,
  title,
  body,
  actionLabel,
  onAction,
  featured = false,
}: {
  icon: React.ElementType
  eyebrow: string
  title: string
  body: string
  actionLabel: string
  onAction: () => void
  featured?: boolean
}) {
  return (
    <div className={`rounded-3xl border p-5 shadow-brand-sm ${
      featured
        ? 'border-aletis-gold/45 bg-gradient-to-br from-white via-aletis-gold/8 to-aletis-cream-papel'
        : 'border-aletis-cream-escuro bg-card'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border ${
          featured ? 'border-aletis-gold/45 bg-aletis-gold/20 text-aletis-gold-escuro' : 'border-aletis-sage/30 bg-aletis-sage/15 text-foreground'
        }`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-[10px] font-bold uppercase tracking-widest text-aletis-gold-escuro">{eyebrow}</p>
          <h3 className="mt-1 font-display text-lg font-bold leading-tight text-foreground">{title}</h3>
        </div>
      </div>
      <p className="mt-3 min-h-[42px] font-body text-sm leading-relaxed text-muted-foreground">{body}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-aletis-cream-escuro bg-muted px-3 py-2 font-body text-xs font-bold text-foreground hover:border-aletis-gold/50 hover:bg-white"
      >
        {actionLabel} <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function PortalSectionHeader({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  action,
}: {
  icon: React.ElementType
  eyebrow: string
  title: string
  subtitle: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-aletis-cream-escuro/70 bg-white/70 px-4 py-3 shadow-brand-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-aletis-gold/35 bg-aletis-gold/12 text-aletis-gold-escuro">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-[10px] font-bold uppercase tracking-widest text-aletis-gold-escuro">{eyebrow}</p>
          <h2 className="mt-0.5 font-display text-lg font-bold tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 max-w-2xl font-body text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </div>
  )
}

function PortalNextDocument({ requests, onOpen }: { requests: PendenciaDTO[]; onOpen: () => void }) {
  const pending = sortPortalRequests(requests).filter(needsClientAction)
  const next = pending[0]
  if (!next) return null
  return <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 rounded-2xl border border-aletis-gold/45 bg-aletis-gold/10 p-4 text-left transition hover:bg-aletis-gold/20 sm:p-5">
    <Inbox size={22} className="mt-1 shrink-0 text-aletis-gold-escuro" />
    <span className="min-w-0 flex-1"><span className="block text-xs font-semibold uppercase tracking-wide text-aletis-gold-escuro">Sua próxima ação · {pending.length} pedido(s) para enviar</span><span className="mt-1 block break-words font-display text-lg font-bold text-foreground">{next.titulo}</span><span className="mt-2 block text-sm leading-relaxed text-muted-foreground">{next.status === 'rejeitado' ? 'A equipe pediu um ajuste. Veja a orientação e envie a nova versão.' : next.descricao || 'Confira a orientação da equipe e envie o documento pelo pedido.'}{next.prazo ? ` Prazo: ${portalDateOnly(next.prazo)}.` : ''}</span><span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-foreground">Ver o que preciso enviar <ChevronRight size={15} /></span></span>
  </button>
}

function PortalMyDetails({ cliente, onContact }: { cliente: ClienteMe; onContact: () => void }) {
  const fields: Array<[string, string]> = [
    ['Nome / razão social', cliente.nome], ['CPF / CNPJ', cliente.cpfCnpj],
    ['Município', [cliente.cidade, cliente.uf].filter(Boolean).join(' / ')],
    ['E-mail', cliente.email], ['Telefone', cliente.telefone], ['Atividade', cliente.atividade],
    ['Culturas', cliente.culturas?.join(', ')], ['Consultor responsável', cliente.consultor],
  ]
  return <details className="card-premium p-4 sm:p-5">
    <summary className="cursor-pointer font-display text-base font-bold text-foreground"><User size={17} className="mr-2 inline" />Meus dados e atendimento</summary>
    <p className="mt-3 text-sm text-muted-foreground">Confira os dados usados no seu atendimento. Se algo mudou, informe a equipe pela conversa.</p>
    <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm text-foreground">{value || 'A confirmar com a equipe'}</dd></div>)}</dl>
    <button type="button" onClick={onContact} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-aletis-cream-escuro px-4 text-sm font-semibold text-foreground hover:bg-aletis-cream"><MessageCircle size={16} />Informar uma atualização</button>
  </details>
}

/* ──────────────────────────────────────────────────────────────
 * UPLOAD ESPONTÂNEO — botão drag-drop
 * ──────────────────────────────────────────────────────────── */
/* ──────────────────────────────────────────────────────────────
 * DASHBOARD
 * ────────────────────────────────────────────────────────────── */
function ClientDashboard({
  token,
  cliente,
  onLogout,
  onTokenChanged,
  onRefreshCliente,
}: {
  token: string
  cliente: ClienteMe
  onLogout: () => void
  onRefreshCliente: () => Promise<void>
  onTokenChanged: (token: string) => void
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const destination = useMemo(() => readPortalDestination(searchParams), [searchParams])
  const activeView = destination.view
  const mainRef = useRef<HTMLElement>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState<string | null>(null)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [documentsReady, setDocumentsReady] = useState(false)
  const documentReadVersion = useRef(0)
  const [pulse, setPulse] = useState<PulseDTO | null>(null)
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [stepper, setStepper] = useState<StepperItem[]>([])
  const [timeline, setTimeline] = useState<TimelineEventoDTO[]>([])
  const [documentos, setDocumentos] = useState<DocumentoDTO[]>([])
  const [pendencias, setPendencias] = useState<PendenciaDTO[]>([])
  const [uploads, setUploads] = useState<UploadDTO[]>([])
  const [cronograma, setCronograma] = useState<CronogramaDTO | null>(null)
  const [memoria, setMemoria] = useState<MemoriaSimplificadaDTO | null>(null)
  const [auditoria, setAuditoria] = useState<AuditoriaEventoDTO[]>([])
  const [mensagens, setMensagens] = useState<MensagemDTO[]>([])
  const [honorarios, setHonorarios] = useState<HonorariosProjecaoDTO | null>(null)
  const [breakdownCredor, setBreakdownCredor] = useState<BreakdownCredorDTO[]>([])
  const [inteligencia, setInteligencia] = useState<PortalCaseIntelligenceDTO | null>(null)
  const [chatDraft, setChatDraft] = useState('')
  const [alixPrompt, setAlixPrompt] = useState('')
  const [alixMounted, setAlixMounted] = useState(activeView === 'alix')
  const [previewUpload, setPreviewUpload] = useState<UploadDTO | null>(null)
  const [seenTimelineAt, setSeenTimelineAt] = useState<string | null>(() => { try { return localStorage.getItem(`aletis.portal.andamentos.v1:${cliente.id}`) } catch { return null } })
  const [showTrocarSenha, setShowTrocarSenha] = useState(cliente.forcaTrocaSenha)
  const push = usePortalPush({ token })

  const navigatePortal = useCallback((next: PortalDestination) => {
    if (next.draft !== undefined) {
      if (next.view === 'mensagens') setChatDraft(next.draft.slice(0, 3000))
      if (next.view === 'alix') setAlixPrompt(next.draft.slice(0, 3000))
    }
    setPreviewUpload(null)
    const params = portalDestinationParams(searchParams, next)
    if (params.toString() !== searchParams.toString()) setSearchParams(params)
  }, [setSearchParams, searchParams])
  const setActiveView = useCallback((view: PortalView) => navigatePortal({ view }), [navigatePortal])

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<PortalDestination>).detail
      if (!detail || !PORTAL_VIEWS.includes(detail.view)) return
      const requestId = typeof detail.requestId === 'string' && pendencias.some(request => request.id === detail.requestId) ? detail.requestId : undefined
      navigatePortal({ view: detail.view, requestId, matterId: typeof detail.matterId === 'string' ? detail.matterId : undefined, draft: typeof detail.draft === 'string' ? detail.draft : undefined })
    }
    const onAlix = (event: Event) => { const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt; navigatePortal({ view: 'alix', draft: typeof prompt === 'string' ? prompt : undefined }) }
    window.addEventListener('portal:navigate', onNavigate)
    window.addEventListener('aletis:portal-alix-open', onAlix)
    return () => { window.removeEventListener('portal:navigate', onNavigate); window.removeEventListener('aletis:portal-alix-open', onAlix) }
  }, [navigatePortal, pendencias])

  useEffect(() => {
    if (activeView === 'alix') setAlixMounted(true)
    document.title = `${PORTAL_VIEW_LABEL[activeView]} · Portal ALETIS`
    mainRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'auto' })
    if (activeView === 'historico') {
      const seen = new Date().toISOString()
      setSeenTimelineAt(seen)
      try { localStorage.setItem(`aletis.portal.andamentos.v1:${cliente.id}`, seen) } catch { /* Preferência disponível apenas nesta visita. */ }
    }
  }, [activeView, cliente.id])

  useEffect(() => {
    const controller = new AbortController()
    const update = async (event: Event) => {
      if ((event as CustomEvent<{ clienteId: string }>).detail?.clienteId !== cliente.id) return
      const response = await apiCall<MensagemDTO[]>('/api/portal/mensagens', { token, signal: controller.signal })
      if (response.ok && !controller.signal.aborted) setMensagens(response.data)
    }
    window.addEventListener('portal:messages-updated', update)
    return () => { controller.abort(); window.removeEventListener('portal:messages-updated', update) }
  }, [cliente.id, token])


  const fetchTudo = useCallback(async () => {
    // Consultas não marcam mensagens como lidas. A conversa confirma a leitura explicitamente.
    const version = ++documentReadVersion.current
    const [agg, p, u, cr, me, au, m] = await Promise.all([
      apiCall<PortalDashboardDTO>('/api/portal/dashboard', { token }),
      apiCall<PendenciaDTO[]>('/api/portal/pendencias', { token }),
      apiCall<UploadDTO[]>('/api/portal/uploads', { token }),
      apiCall<CronogramaDTO>('/api/portal/cronograma', { token }),
      apiCall<MemoriaSimplificadaDTO>('/api/portal/memoria-simplificada', { token }),
      apiCall<AuditoriaEventoDTO[]>('/api/portal/auditoria', { token }),
      apiCall<MensagemDTO[]>('/api/portal/mensagens', { token }),
    ])
    if (agg.ok) {
      setPulse(agg.data.pulse)
      setContrato(agg.data.contrato)
      setStepper(agg.data.stepper)
      setTimeline(agg.data.timeline)
      setDocumentos(agg.data.documentos)
      setHonorarios(agg.data.honorarios)
      setBreakdownCredor(agg.data.breakdownCredor)
      setInteligencia(agg.data.inteligencia)
    }
    if (version === documentReadVersion.current) {
      if (p.ok) setPendencias(p.data)
      if (u.ok) setUploads(u.data)
      if (p.ok && u.ok) setDocumentsReady(true)
      setDocumentsError(!p.ok || !u.ok ? 'Não foi possível atualizar seus pedidos e arquivos. Tente novamente.' : null)
    }
    setDataError(!agg.ok ? 'Não foi possível atualizar o resumo do atendimento.' : null)
    setDataLoading(false)
    if (cr.ok) setCronograma(cr.data)
    if (me.ok) setMemoria(me.data)
    if (au.ok) setAuditoria(au.data)
    if (m.ok) setMensagens(m.data)
  }, [token])

  useEffect(() => { fetchTudo() }, [fetchTudo])

  // Polling leve de pulse (15s); mensagens via SSE separado.
  useEffect(() => {
    const h = window.setInterval(async () => {
      const pl = await apiCall<PulseDTO>('/api/portal/pulse', { token })
      if (pl.ok) setPulse(pl.data)
    }, 15_000)
    return () => window.clearInterval(h)
  }, [token])

  // Stream de mensagens via SSE — em tempo real (substitui polling).
  // Auth via cookie HttpOnly setado no login (withCredentials: true).
  // Fallback gracios para polling se SSE falhar.
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const url = `/api/portal/mensagens/stream`
    let es: EventSource | null = null
    try {
      es = new EventSource(url, { withCredentials: true })
      es.addEventListener('snapshot', (ev: MessageEvent) => {
        try { setMensagens(JSON.parse(ev.data) as MensagemDTO[]) } catch { /* ignore */ }
      })
      es.addEventListener('mensagem', (ev: MessageEvent) => {
        try {
          const m = JSON.parse(ev.data) as MensagemDTO
          setMensagens((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m])
        } catch { /* ignore */ }
      })
      es.onerror = () => { /* retry automático nativo */ }
    } catch { /* SSE bloqueado; polling abaixo cobre */ }
    // Polling-fallback de baixa frequência caso SSE não conecte
    const fallback = window.setInterval(async () => {
      if (!es || es.readyState === 2 /* CLOSED */) {
        const m = await apiCall<MensagemDTO[]>('/api/portal/mensagens', { token })
        if (m.ok) setMensagens(m.data)
      }
    }, 30_000)
    return () => {
      es?.close()
      window.clearInterval(fallback)
    }
  }, [token])

  const naoLidas = useMemo(
    () => mensagens.filter((m) => m.de === 'consultor' && !m.lidaEm).length,
    [mensagens],
  )

  const refreshPendencias = useCallback(async () => {
    const version = ++documentReadVersion.current
    const [p, u, pl] = await Promise.all([
      apiCall<PendenciaDTO[]>('/api/portal/pendencias', { token }),
      apiCall<UploadDTO[]>('/api/portal/uploads', { token }),
      apiCall<PulseDTO>('/api/portal/pulse', { token }),
    ])
    if (version !== documentReadVersion.current) return
    if (p.ok) setPendencias(p.data)
    if (u.ok) setUploads(u.data)
    if (p.ok && u.ok) setDocumentsReady(true)
    setDocumentsError(!p.ok || !u.ok ? 'Não foi possível atualizar seus pedidos e arquivos. Tente novamente.' : null)
    if (pl.ok) setPulse(pl.data)
  }, [token])

  useEffect(() => {
    if (activeView !== 'historico' && activeView !== 'painel') return
    const controller = new AbortController()
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return
      const result = await apiCall<TimelineEventoDTO[]>('/api/portal/timeline', { token, signal: controller.signal })
      if (result.ok && !controller.signal.aborted) setTimeline(result.data)
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 20_000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [activeView, token])

  const uploadQueue = usePortalUploadQueue(token, upload => {
    setUploads(previous => [...previous.filter(item => item.id !== upload.id), upload])
    void refreshPendencias()
  })
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshPendencias()
    }, activeView === 'documentos' && uploads.some(uploadIsProcessing) ? 6_000 : 20_000)
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refreshPendencias() }
    document.addEventListener('visibilitychange', refreshVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshVisible) }
  }, [activeView, refreshPendencias, uploads])

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6f3e8_0%,#efe9d8_46%,#f7f4ea_100%)]">
      <PortalNavigation cliente={cliente} view={activeView} pendingCount={pendencias.filter(needsClientAction).length} unreadCount={naoLidas} onNavigate={setActiveView} onPassword={() => setShowTrocarSenha(true)} onLogout={onLogout} />
      <main ref={mainRef} id="portal-content" tabIndex={-1} className="mx-auto max-w-7xl space-y-5 px-4 pb-28 pt-5 outline-none sm:px-6 lg:pb-8 lg:pt-7">
        {dataLoading && <p role="status" className="rounded-xl bg-card p-4 text-sm text-muted-foreground">Atualizando seu atendimento…</p>}
        {(dataError || documentsError) && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{dataError || documentsError}</p><button type="button" onClick={() => void fetchTudo()} className="min-h-10 rounded-lg border border-amber-300 px-3 font-semibold">Tentar novamente</button></div>}
        {activeView !== 'documentos' && (uploadQueue.busy || uploadQueue.items.some(item => item.status === 'erro')) && <button type="button" onClick={() => setActiveView('documentos')} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-aletis-gold/40 bg-card px-4 py-3 text-left text-sm font-semibold text-foreground"><span>{uploadQueue.busy ? 'Seus arquivos continuam sendo enviados' : 'Há arquivos que precisam de nova tentativa'}</span><span>Ver envios →</span></button>}

        {activeView === 'painel' && <PortalHome token={token} cliente={cliente} requests={pendencias} uploads={uploads} messages={mensagens} timeline={timeline} pulse={pulse} documentsReady={documentsReady} seenTimelineAt={seenTimelineAt} onNavigate={navigatePortal} onAskAlix={prompt => navigatePortal({ view: 'alix', draft: prompt })} />}

        {activeView === 'documentos' && (
          <section className="space-y-5 animate-fade-in">
            <PortalSectionHeader
              icon={Files}
              eyebrow="Documentos"
              title="Documentos do seu atendimento"
              subtitle="Veja o que a equipe precisa, envie seus arquivos e acompanhe cada etapa até a conferência."
              action={(
                <button
                  type="button"
                  onClick={() => openPortalAlix('Quais documentos faltam e como devo enviar?')}
                  className="inline-flex items-center gap-2 rounded-xl border border-aletis-cream-escuro bg-card px-3 py-2 font-body text-xs font-bold text-foreground hover:border-aletis-gold/50"
                >
                  <Bot className="h-4 w-4" /> Tirar dúvida
                </button>
              )}
            />

            {documentsReady && destination.requestId && !pendencias.some(request => request.id === destination.requestId) && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Este pedido não está disponível neste atendimento. Veja seus pedidos atuais abaixo.</p>}
            <PortalUploadQueuePanel queue={uploadQueue} />
            {!documentsReady ? <div className="card-premium p-6 text-sm text-muted-foreground">{documentsError ? 'Seus pedidos ainda não puderam ser carregados. Use “Tentar novamente” acima.' : 'Carregando pedidos e documentos…'}</div> : <>
              <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
                <PendenciasInbox pendencias={pendencias} uploads={uploads} queue={uploadQueue} selectedRequestId={destination.requestId} onOpenUpload={id => setPreviewUpload(uploads.find(upload => upload.id === id) || null)} />
                <div className="min-w-0 space-y-4"><UploadEspontaneo queue={uploadQueue} /><div className="rounded-2xl border border-aletis-sage/40 bg-aletis-sage/10 p-5 text-sm leading-relaxed text-muted-foreground"><h3 className="mb-2 font-semibold text-foreground">Como preparar um bom envio</h3><ul className="list-disc space-y-2 pl-4"><li>Inclua todas as páginas, sem cortar nomes, datas ou valores.</li><li>Prefira o PDF original. Para fotos, use boa luz e confira se o texto está legível.</li><li>Se precisar corrigir algo, envie pelo mesmo pedido para manter o histórico.</li></ul></div></div>
              </div>
              <CofreDigital uploads={uploads} token={token} pendencias={pendencias} />
            </>}

          </section>
        )}

        {activeView === 'financeiro' && (
          <section className="space-y-5 animate-fade-in">
            <PortalSectionHeader
              icon={BarChart3}
              eyebrow="Financeiro"
              title="Números, negociação e pagamentos"
              subtitle="Veja saldo em aberto, economia mapeada, honorários, cronograma e memória de cálculo."
              action={(
                <button
                  type="button"
                  onClick={() => openPortalAlix('Explique meus números: saldo, economia, pagamentos e honorários.')}
                  className="inline-flex items-center gap-2 rounded-xl border border-aletis-cream-escuro bg-card px-3 py-2 font-body text-xs font-bold text-foreground hover:border-aletis-gold/50"
                >
                  <Bot className="h-4 w-4" /> Perguntar sobre valores
                </button>
              )}
            />

            {contrato ? (
              <div>
                <EconomiaHero contrato={contrato} breakdownCredor={breakdownCredor} />
                {contrato.dividas.length > 0 && (
                  <div className="card-premium mt-4 overflow-hidden">
                    <div className="border-b border-aletis-cream-escuro/60 bg-muted px-4 py-3">
                      <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Contratos por credor ({contrato.dividas.length})
                      </p>
                    </div>
                    <ul className="divide-y divide-aletis-cream-escuro/50">
                      {contrato.dividas.map((d, i) => (
                        <li key={i} className="flex items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-body text-sm font-bold text-foreground">{d.credor}</p>
                            <p className="font-body text-[12px] text-muted-foreground">{d.contrato} · venc. {formatDate(d.vencimento)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-display text-sm font-bold tabular-nums text-foreground">{formatBRL(d.valorAtualizado)}</p>
                            {d.valorOriginal !== d.valorAtualizado && (
                              <p className="font-body text-[11px] text-muted-foreground line-through">{formatBRL(d.valorOriginal)}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="card-premium p-8 text-center">
                <Landmark className="mx-auto h-8 w-8 text-aletis-gold-escuro" />
                <h3 className="mt-3 font-display text-xl font-bold text-foreground">Dados financeiros em preparação</h3>
                <p className="mx-auto mt-2 max-w-xl font-body text-sm text-muted-foreground">
                  Quando a equipe cadastrar saldos, acordos ou cronograma, tudo aparecerá nesta área com explicação simples.
                </p>
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
              <HonorariosCard honorarios={honorarios} />
              {cronograma && <CronogramaCard cronograma={cronograma} />}
            </div>

            {memoria && <MemoriaSimplificada memoria={memoria} />}
          </section>
        )}

        {activeView === 'assuntos' && <PortalMatters token={token} onNavigate={navigatePortal} selectedMatterId={destination.matterId} onSelectMatter={matterId => navigatePortal({view:'assuntos',matterId})} onAskAlix={draft => navigatePortal({view:'alix',draft})} />}
        {activeView === 'fiscal' && <PortalFiscal token={token} uploads={uploads} onNavigate={navigatePortal} />}
        {activeView === 'historico' && <div className="space-y-5"><PortalTimeline events={timeline} />{auditoria.length > 0 && <details className="rounded-3xl border border-aletis-cream-escuro bg-card p-5"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-foreground">Registros de acesso e exportação dos meus dados</summary><AuditoriaTimeline eventos={auditoria} token={token} /></details>}</div>}

        <div hidden={activeView !== 'mensagens'}><PortalMessages key={cliente.id} clienteId={cliente.id} token={token} mode="cliente" clienteNome={cliente.nome} uploads={uploads} requests={pendencias} initialDraft={chatDraft} active={activeView === 'mensagens'} /></div>
        {alixMounted && <section hidden={activeView !== 'alix'} className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-aletis-gold-escuro">Sua assistente</p><h1 className="mt-2 font-display text-2xl font-bold text-foreground">Converse com a ALIX</h1><p className="mt-2 text-sm text-muted-foreground">Entenda seus documentos, pedidos e andamentos com as informações do seu portal.</p></div><AlixPortalChat cliente={cliente} token={token} embedded hideTrigger initialPrompt={alixPrompt} /></section>}
        <div hidden={activeView !== 'ajuda'}><PortalSupport key={cliente.id} cliente={cliente} token={token} active={activeView === 'ajuda'} onContact={draft => navigatePortal({ view: 'mensagens', draft })} onProfileRefresh={onRefreshCliente} />
          {push.state !== 'unsupported' && <section className="mt-5 rounded-3xl border border-aletis-cream-escuro bg-card p-5"><h2 className="font-display text-lg font-bold text-foreground">Avisos do portal</h2><p className="mt-2 text-sm text-muted-foreground">Ative os avisos deste navegador para saber quando houver novas orientações da equipe.</p>{push.state === 'subscribed' ? <button type="button" onClick={push.unsubscribe} className="mt-3 min-h-11 rounded-xl border border-aletis-cream-escuro px-4 text-sm font-semibold text-foreground">Desativar avisos neste navegador</button> : push.state === 'denied' ? <p className="mt-3 text-sm text-amber-900">Os avisos estão bloqueados nas configurações deste navegador.</p> : <button type="button" onClick={push.subscribe} disabled={push.state === 'pending'} className="mt-3 min-h-11 rounded-xl bg-aletis-verde px-4 text-sm font-semibold text-white disabled:opacity-50">{push.state === 'pending' ? 'Ativando…' : 'Ativar avisos neste navegador'}</button>}{push.errorMsg && <p role="alert" className="mt-2 text-sm text-red-800">{push.errorMsg}</p>}</section>}
        </div>
        {previewUpload && <PortalDocumentPreview upload={previewUpload} token={token} onClose={() => setPreviewUpload(null)} />}

        <footer className="pt-8 pb-2 text-center font-body text-[11px] text-muted-foreground">
          ALETIS · Verdade nos números, prosperidade nos acordos. ·{' '}
          <button type="button" onClick={() => setActiveView('ajuda')} className="min-h-11 px-1 underline hover:text-aletis-gold-escuro">Meus dados e ajuda</button>
        </footer>
      </main>

      {showTrocarSenha && (
        <TrocarSenhaModal
          token={token}
          obrigatorio={cliente.forcaTrocaSenha}
          onClose={() => setShowTrocarSenha(false)}
          onTrocou={nextToken => {
            if (nextToken) onTokenChanged(nextToken)
            setShowTrocarSenha(false)
          }}
        />
      )}
    </div>
  )
}

function SectionTitle({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} className="text-aletis-gold-escuro" />
      <h2 className="font-display text-base font-bold uppercase tracking-wider text-foreground">
        {title}
      </h2>
      {badge && (
        <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-display font-bold uppercase tracking-wider bg-aletis-gold text-foreground">
          {badge}
        </span>
      )}
    </div>
  )
}

function KpiTile({ label, value, icon: Icon, accent }: {
  label: string
  value: string
  icon: React.ElementType
  accent?: 'sage' | 'gold'
}) {
  const ringCls = accent === 'gold' ? 'border-aletis-gold/40 bg-gradient-to-br from-white to-aletis-gold/8' :
    accent === 'sage' ? 'border-aletis-sage/40' : 'border-aletis-cream-escuro/70'
  const iconCls = accent === 'gold' ? 'bg-aletis-gold/20 text-aletis-gold-escuro border-aletis-gold/40' :
    accent === 'sage' ? 'bg-aletis-sage/25 text-foreground border-aletis-sage/40' :
    'bg-aletis-cream text-muted-foreground border-aletis-cream-escuro/60'
  return (
    <div className={`rounded-2xl border ${ringCls} p-5 shadow-brand-sm hover:shadow-brand transition`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${iconCls}`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="font-display text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      </div>
      <p className="font-display text-2xl sm:text-3xl font-bold text-foreground tabular-nums">
        {value}
      </p>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * ROOT — handle URL params (?magic, ?reset) + sessão JWT
 * ──────────────────────────────────────────────────────────── */
// Wrapper público com ErrorBoundary — captura crashes em qualquer
// sub-componente do portal e oferece reload em vez de tela branca.
export default function PortalCliente() {
  return (
    <PortalErrorBoundary>
      <PortalClienteInner />
    </PortalErrorBoundary>
  )
}

function PortalClienteInner() {
  const { token, cliente, sessionError, authenticate, refreshCliente, rotateToken, logout } = usePortalSession()
  const [verificando, setVerificando] = useState<boolean>(true)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [magicErro, setMagicErro] = useState<string | null>(null)

  // Processa magic/reset da URL no mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const magic = url.searchParams.get('magic')
    const reset = url.searchParams.get('reset')

    if (reset) {
      setResetToken(reset)
      setVerificando(false)
      url.searchParams.delete('reset')
      window.history.replaceState({}, '', url.toString())
      return
    }

    if (magic) {
      ;(async () => {
        const r = await apiCall<{ token: string; cliente: ClienteMe }>('/api/portal/auth/magic/redeem', {
          method: 'POST',
          body: JSON.stringify({ token: magic }),
        })
        url.searchParams.delete('magic')
        window.history.replaceState({}, '', url.toString())
        if (r.ok) {
          authenticate(r.data.token, r.data.cliente)
        } else {
          setMagicErro(r.error || 'Link mágico inválido ou expirado.')
        }
        setVerificando(false)
      })()
      return
    }
    setVerificando(false)
  }, [])

  useEffect(() => {
    if (token && !cliente) refreshCliente()
  }, [token, cliente, refreshCliente])

  if (verificando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-aletis-cream-marfim">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-aletis-gold-escuro" />
          <p className="font-body text-[12.5px] text-muted-foreground">Validando seu acesso…</p>
        </div>
      </div>
    )
  }

  if (resetToken) {
    return (
      <ResetSenhaScreen
        token={resetToken}
        onConcluido={() => {
          setResetToken(null)
        }}
      />
    )
  }

  if (token && !cliente) return <div className="flex min-h-screen items-center justify-center bg-aletis-cream-marfim p-5"><div className="max-w-md rounded-3xl bg-card p-6 text-center"><p role={sessionError ? 'alert' : 'status'} className="text-sm text-foreground">{sessionError || 'Carregando seu atendimento…'}</p>{sessionError && <button type="button" onClick={() => void refreshCliente()} className="mt-4 min-h-11 rounded-xl bg-aletis-verde px-4 font-semibold text-white">Tentar novamente</button>}</div></div>

  if (!token || !cliente) {
    return (
      <>
        {magicErro && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100]">
            <ErrorBanner message={magicErro} />
          </div>
        )}
        <LoginScreen
          onLogin={authenticate}
        />
      </>
    )
  }

  return (
    <>
      <ClientDashboard
        key={cliente.id}
        token={token}
        onTokenChanged={rotateToken}
        cliente={cliente}
        onRefreshCliente={refreshCliente}
        onLogout={logout}
      />
    </>
  )
}
