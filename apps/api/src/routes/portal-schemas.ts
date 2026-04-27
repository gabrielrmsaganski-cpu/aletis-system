/**
 * Schemas Zod do Portal do Cliente.
 *
 * Valida todos os bodies/queries das rotas /api/portal e dos
 * endpoints admin /api/clientes/:id/portal/*. Mantém os tipos em
 * runtime alinhados com o que a API publica em produção.
 */
import { z } from 'zod'

const cpfCnpjOrEmail = z.string().trim().min(1).max(254)

export const LoginSchema = z.object({
  usuario: z.string().trim().min(1).max(254),
  senha: z.string().min(1).max(200),
})

export const MagicRequestSchema = z.object({
  identificador: z.string().trim().min(1).max(254),
})

export const MagicRedeemSchema = z.object({
  token: z.string().trim().min(8).max(2000),
})

export const ForgotSchema = z.object({
  identificador: cpfCnpjOrEmail,
})

export const ResetSchema = z.object({
  token: z.string().trim().min(8).max(2000),
  novaSenha: z.string().min(8).max(200),
})

export const TrocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1).max(200),
  novaSenha: z.string().min(8).max(200),
})

export const MensagemBodySchema = z.object({
  texto: z.string().trim().min(1).max(2000),
})

export const UploadJsonSchema = z.object({
  nome: z.string().trim().min(1).max(255).optional(),
  mime: z.string().trim().min(1).max(200).optional(),
  conteudoBase64: z.string().min(1).max(35_000_000), // ~25MB base64
  pendenciaId: z.string().trim().max(80).optional(),
  categoria: z
    .enum(['fiscal', 'contrato', 'identidade', 'patrimonio', 'agro', 'outros'])
    .optional(),
})

export const PendenciaCreateSchema = z.object({
  titulo: z.string().trim().min(2).max(200),
  descricao: z.string().trim().max(2000).optional(),
  categoria: z
    .enum(['fiscal', 'contrato', 'identidade', 'patrimonio', 'agro', 'outros'])
    .optional(),
  obrigatorio: z.boolean().optional(),
  solicitadoPor: z.string().trim().max(120).optional(),
})

export const PendenciaPatchSchema = z.object({
  status: z.enum(['pendente', 'enviado', 'aprovado', 'rejeitado']).optional(),
  observacao: z.string().trim().max(2000).optional(),
})

export const ConvitePortalSchema = z.object({
  motivo: z.enum(['primeiro_acesso', 'recuperacao', 'reengajamento']).optional(),
})

export const PortalAccessCreateSchema = z.object({
  usuario: z.string().trim().min(2).max(254).optional(),
  senhaInicial: z.string().min(4).max(200).optional(),
})

export const PortalAccessPatchSchema = z.object({
  ativo: z.boolean(),
})

export const ClienteIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(80),
})

export const PendenciaParamsSchema = z.object({
  id: z.string().trim().min(1).max(80),
  pid: z.string().trim().min(1).max(80),
})

export const UploadIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(80),
})
