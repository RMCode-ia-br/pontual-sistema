import { cssDoTema, derivarTemaDaMarca } from "@/lib/tema/derivar";

/**
 * Injeta no <head> as variáveis de cor derivadas da cor da marca (Configurações > Empresa), nos modos claro e escuro,
 * com contraste AA garantido. Sem cor válida não renderiza nada e vale o padrão do globals.css.
 * O CSS só contém hex #rrggbb validado (derivarTemaDaMarca), então não há injeção possível.
 */
export function EstiloDaMarca({ cor }: { cor: string | null | undefined }) {
  const tema = derivarTemaDaMarca(cor);
  if (!tema) return null;
  return <style id="estilo-da-marca" dangerouslySetInnerHTML={{ __html: cssDoTema(tema) }} />;
}
