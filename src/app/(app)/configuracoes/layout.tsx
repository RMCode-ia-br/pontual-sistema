import { SubmenuConfiguracoes } from "@/components/layout/submenu-configuracoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { permissoesDe } from "@/lib/permissoes";

export default async function LayoutConfiguracoes({ children }: { children: React.ReactNode }) {
  const { modulos, verValores, verCustoMargem } = permissoesDe(await exigirSessao());
  return (
    <div>
      <SubmenuConfiguracoes permissoes={{ modulos, verValores, verCustoMargem }} />
      {children}
    </div>
  );
}
