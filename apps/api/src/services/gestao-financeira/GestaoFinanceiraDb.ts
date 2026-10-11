import type { getDb } from '../../db/client.js'

// Contrato comum entre o banco Drizzle e uma transação já aberta.
// Serviços recebem a conexão explicitamente; nenhuma conexão global é trocada.
export type GestaoFinanceiraDb = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update' | 'delete' | 'execute'>
