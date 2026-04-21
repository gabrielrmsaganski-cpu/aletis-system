'use client'

import { useState } from 'react'
import {
  User,
  Mail,
  Phone,
  Building2,
  MapPin,
  Target,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/cn'

type Segmento = '' | 'produtor' | 'grupo' | 'coop' | 'cerealista' | 'empresa' | 'outro'
type Interesse = '' | 'reestruturacao' | 'revisional' | 'mercado' | 'tecnologia' | 'diagnostico' | 'outro'
type Tamanho = '' | 'ate_500ha' | '500_2000' | '2000_5000' | 'mais_5000' | 'nao_rural'

interface FormState {
  nome: string
  email: string
  telefone: string
  segmento: Segmento
  interesse: Interesse
  cidade: string
  uf: string
  tamanho: Tamanho
  mensagem: string
  consent: boolean
}

const emptyForm: FormState = {
  nome: '',
  email: '',
  telefone: '',
  segmento: '',
  interesse: 'diagnostico',
  cidade: '',
  uf: '',
  tamanho: '',
  mensagem: '',
  consent: false,
}

export function ContatoForm() {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const isValid =
    form.nome.trim().length >= 2 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) &&
    form.telefone.trim().length >= 8 &&
    form.consent

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || status === 'loading') return
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Erro ao enviar')
      }
      setStatus('success')
      setForm(emptyForm)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Erro desconhecido')
    }
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-50 p-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <h3 className="mt-4 font-display text-2xl font-semibold text-aletis-grafite-escuro">
          Recebemos sua mensagem.
        </h3>
        <p className="mt-2 max-w-md text-sm text-aletis-grafite-medio">
          Um consultor ALETIS retorna em até 1 dia útil. Se a urgência é imediata, fale pelo
          WhatsApp.
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-6 font-display text-[12px] font-semibold uppercase tracking-wider2 text-aletis-verde-escuro hover:text-aletis-dourado-escuro"
        >
          Enviar outra mensagem
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome completo" icon={User} required>
          <input
            type="text"
            autoComplete="name"
            required
            value={form.nome}
            onChange={(e) => set('nome', e.target.value)}
            placeholder="Como podemos chamá-lo"
            className="field-input"
          />
        </Field>
        <Field label="E-mail corporativo" icon={Mail} required>
          <input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="seu@email.com"
            className="field-input"
          />
        </Field>
        <Field label="WhatsApp / Telefone" icon={Phone} required>
          <input
            type="tel"
            autoComplete="tel"
            required
            value={form.telefone}
            onChange={(e) => set('telefone', e.target.value)}
            placeholder="(45) 9 9999-0000"
            className="field-input"
          />
        </Field>
        <Field label="Perfil / Segmento" icon={Building2}>
          <select
            value={form.segmento}
            onChange={(e) => set('segmento', e.target.value as Segmento)}
            className="field-input"
          >
            <option value="">Selecione</option>
            <option value="produtor">Produtor rural</option>
            <option value="grupo">Grupo agrícola</option>
            <option value="coop">Cooperativa</option>
            <option value="cerealista">Cerealista / Trading</option>
            <option value="empresa">Empresa do agro</option>
            <option value="outro">Outro</option>
          </select>
        </Field>
        <Field label="Cidade" icon={MapPin}>
          <input
            type="text"
            value={form.cidade}
            onChange={(e) => set('cidade', e.target.value)}
            placeholder="Cidade"
            className="field-input"
          />
        </Field>
        <Field label="UF">
          <input
            type="text"
            maxLength={2}
            value={form.uf}
            onChange={(e) => set('uf', e.target.value.toUpperCase())}
            placeholder="UF"
            className="field-input uppercase"
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Interesse principal" icon={Target}>
          <select
            value={form.interesse}
            onChange={(e) => set('interesse', e.target.value as Interesse)}
            className="field-input"
          >
            <option value="diagnostico">Diagnóstico gratuito</option>
            <option value="reestruturacao">Reestruturação de dívida</option>
            <option value="revisional">Revisional / abusividade</option>
            <option value="mercado">Inteligência de mercado</option>
            <option value="tecnologia">Tecnologia / CRM / ALIX</option>
            <option value="outro">Outro</option>
          </select>
        </Field>
        <Field label="Tamanho da operação">
          <select
            value={form.tamanho}
            onChange={(e) => set('tamanho', e.target.value as Tamanho)}
            className="field-input"
          >
            <option value="">Selecione</option>
            <option value="ate_500ha">Até 500 ha</option>
            <option value="500_2000">500 – 2.000 ha</option>
            <option value="2000_5000">2.000 – 5.000 ha</option>
            <option value="mais_5000">+ 5.000 ha</option>
            <option value="nao_rural">Não rural</option>
          </select>
        </Field>
      </div>

      <Field label="Contexto (opcional)">
        <textarea
          rows={4}
          value={form.mensagem}
          onChange={(e) => set('mensagem', e.target.value)}
          placeholder="Descreva brevemente a situação — saldo aproximado, credores envolvidos, prazo ideal."
          className="field-input resize-none"
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-aletis-borda bg-aletis-bege/50 px-4 py-3 text-[13px] text-aletis-grafite-medio transition hover:border-aletis-dourado/40">
        <input
          type="checkbox"
          checked={form.consent}
          onChange={(e) => set('consent', e.target.checked)}
          required
          className="mt-0.5 h-4 w-4 rounded border-aletis-borda text-aletis-dourado focus:ring-aletis-dourado"
        />
        <span>
          Autorizo o tratamento dos meus dados conforme a{' '}
          <a href="/politica-privacidade" className="font-semibold text-aletis-verde-escuro underline-offset-2 hover:underline">
            Política de Privacidade
          </a>{' '}
          da ALETIS (LGPD · Lei 13.709/18).
        </span>
      </label>

      {status === 'error' && (
        <div className="flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMsg || 'Erro ao enviar. Tente novamente ou use WhatsApp.'}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={!isValid || status === 'loading'}
          className={cn(
            'btn-primary flex-shrink-0',
            (!isValid || status === 'loading') && 'opacity-60 cursor-not-allowed hover:translate-y-0',
          )}
        >
          {status === 'loading' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando…
            </>
          ) : (
            <>
              Enviar mensagem
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
        <p className="text-[12px] text-aletis-grafite-claro">
          Retorno em até 1 dia útil · NDA sob solicitação
        </p>
      </div>

      <style jsx>{`
        .field-input {
          width: 100%;
          background: white;
          border: 1px solid #e2ddd5;
          border-radius: 12px;
          padding: 12px 14px;
          font-family: var(--font-body), 'Inter', sans-serif;
          font-size: 14px;
          color: #1c1c1e;
          transition: all 0.2s ease;
        }
        .field-input::placeholder {
          color: #a9a39a;
        }
        .field-input:focus {
          outline: none;
          border-color: #c9a84c;
          box-shadow: 0 0 0 4px rgba(201, 168, 76, 0.12);
        }
        .field-input:hover:not(:focus) {
          border-color: #c9a84c40;
        }
      `}</style>
    </form>
  )
}

function Field({
  label,
  icon: Icon,
  required,
  children,
}: {
  label: string
  icon?: React.ElementType
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-display font-semibold uppercase tracking-widest2 text-aletis-grafite-medio">
        {Icon && <Icon className="h-3 w-3 text-aletis-dourado-escuro" />}
        {label}
        {required && <span className="text-aletis-dourado-escuro">*</span>}
      </label>
      {children}
    </div>
  )
}
