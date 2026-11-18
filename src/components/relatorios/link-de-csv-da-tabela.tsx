/** Link "Exportar esta tabela (CSV)" para a tabela de um relatório que não é a do botão do topo. Some no papel. */
export function LinkDeCsvDaTabela({ href }: { href: string }) {
  return (
    <a href={href} className="text-primary text-xs hover:underline print:hidden">
      Exportar esta tabela (CSV)
    </a>
  );
}
