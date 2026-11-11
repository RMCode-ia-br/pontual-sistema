import { AppShell } from "@/components/layout/app-shell";
import { exigirSessao } from "@/lib/auth/sessao";
import { obterMarca } from "@/modules/configuracoes/queries";
import { contarNaoLidas } from "@/modules/notificacoes/queries";

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
