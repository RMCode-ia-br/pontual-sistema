import { AppShell } from "@/components/layout/app-shell";
import { exigirSessao } from "@/lib/auth/sessao";
import { obterMarca } from "@/modules/configuracoes/queries";
import { contarNaoLidas } from "@/modules/notificacoes/queries";

/**
 * Tempo máximo das funções da área logada na Vercel (páginas e ações). Sem isto vale o padrão do plano (10 s sem Fluid
 * Compute), que mataria no meio uma transação de até 30 s (`DURACAO_MAXIMA_DE_TRANSACAO_MS`); com 30 s os dois limites
 * coincidem e a transação termina ou falha com o erro do banco, não com o corte da plataforma. Abaixo do máximo do plano
 * gratuito (60 s sem Fluid Compute).
 */
export const maxDuration = 30;

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  // Toda a área logada exige sessão válida e troca de senha em dia.
  const usuario = await exigirSessao();
  const [marca, naoLidas] = await Promise.all([obterMarca(), contarNaoLidas(usuario.id)]);

  return (
    <AppShell usuario={{ nome: usuario.nome, login: usuario.login }} marca={marca} naoLidas={naoLidas}>
      {children}
    </AppShell>
  );
}
