import "server-only";

import type { Prisma, PrismaClient } from "../../generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type TipoInteracao = "LIGACAO" | "WHATSAPP" | "VISITA" | "EMAIL" | "NOTA" | "SISTEMA";

export type EntradaInteracao = {
  tipo: TipoInteracao;
  texto: string;
  clienteId?: string | null;
  projetoId?: string | null;
  /** Quem registrou; vazio para eventos do sistema. */
  usuarioId?: string | null;
};

/**
 * Registra um item na linha do tempo (cliente e/ou projeto). Eventos do sistema (mudança de fase,
 * proposta enviada, pagamento recebido) usam tipo SISTEMA. A tela da linha do tempo chega com
 * Clientes (Fase 1) e Projetos (Fase 2); até lá este registro já fica disponível e testável.
 */
export async function registrarInteracao(db: Db, entrada: EntradaInteracao): Promise<string> {
  const texto = entrada.texto.trim();
  if (!texto) throw new Error("A interação precisa de um texto.");
  if (texto.length > 4000) throw new Error("A interação passa de 4.000 caracteres.");
  if (!entrada.clienteId && !entrada.projetoId) throw new Error("A interação precisa de um cliente ou de um projeto.");

  const criada = await db.interacao.create({
    data: {
      tipo: entrada.tipo,
      texto,
      clienteId: entrada.clienteId ?? null,
      projetoId: entrada.projetoId ?? null,
      criadoPorId: entrada.usuarioId ?? null,
      atualizadoPorId: entrada.usuarioId ?? null,
    },
    select: { id: true },
  });
  return criada.id;
}
