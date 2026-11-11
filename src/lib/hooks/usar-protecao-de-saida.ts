"use client";

import { useEffect } from "react";

const MENSAGEM = "Há alterações que ainda não foram salvas. Sair desta página?";

/**
 * Protege contra perda de dados (spec seção 7): enquanto `sujo` for verdadeiro, avisa ao fechar a aba,
 * recarregar ou clicar em um link para outra página. Salvar (ou descartar) é desligar `sujo`.
 */
export function useProtecaoDeSaida(sujo: boolean) {
  useEffect(() => {
    if (!sujo) return;

    const antesDeSair = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = "";
    };

    // Em captura, antes do roteador do Next tratar o clique em <Link>.
    const aoClicar = (evento: MouseEvent) => {
      if (evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
      const alvo = evento.target instanceof Element ? evento.target.closest("a[href]") : null;
      if (!alvo || (alvo as HTMLAnchorElement).target === "_blank" || alvo.hasAttribute("download")) return;
      const destino = new URL((alvo as HTMLAnchorElement).href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      if (destino.pathname === window.location.pathname && destino.search === window.location.search) return;
      if (!window.confirm(MENSAGEM)) {
        evento.preventDefault();
        evento.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", antesDeSair);
    document.addEventListener("click", aoClicar, true);
    return () => {
      window.removeEventListener("beforeunload", antesDeSair);
      document.removeEventListener("click", aoClicar, true);
    };
  }, [sujo]);
}
