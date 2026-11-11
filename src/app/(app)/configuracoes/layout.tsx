import { SubmenuConfiguracoes } from "@/components/layout/submenu-configuracoes";

export default function LayoutConfiguracoes({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SubmenuConfiguracoes />
      {children}
    </div>
  );
}
