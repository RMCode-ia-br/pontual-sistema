import { ChevronDown, Mail, MessageCircle, Phone } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { linkWhatsApp } from "@/lib/dominio/modelos-texto";
import { cn } from "@/lib/utils";

type Props = {
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  /** Mensagens prontas (modelos de WhatsApp que já têm todos os valores). */
  mensagens: { titulo: string; texto: string }[];
};

/** Ligar, WhatsApp (com mensagem de um modelo) e e-mail: ações de um toque, principalmente no celular. */
export function BotoesDeContato({ telefone, whatsapp, email, mensagens }: Props) {
  const numeroWhats = whatsapp ?? telefone;
  const linkSimples = numeroWhats ? linkWhatsApp(numeroWhats) : null;
  const estilo = buttonVariants({ variant: "outline" });

  if (!telefone && !linkSimples && !email) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {telefone ? (
        <a href={`tel:${telefone}`} className={estilo}>
          <Phone aria-hidden /> Ligar
        </a>
      ) : null}
      {linkSimples ? (
        <a href={linkSimples} target="_blank" rel="noopener noreferrer" className={estilo}>
          <MessageCircle aria-hidden /> WhatsApp
        </a>
      ) : null}
      {linkSimples && numeroWhats && mensagens.length > 0 ? (
        <details className="relative">
          <summary className={cn(estilo, "cursor-pointer list-none")}>
            Mensagem pronta <ChevronDown aria-hidden />
          </summary>
          <ul className="bg-popover absolute right-0 z-20 mt-1 grid w-72 gap-0.5 rounded-lg border p-1 shadow-md">
            {mensagens.map((m) => (
              <li key={m.titulo}>
                <a
                  href={linkWhatsApp(numeroWhats, m.texto) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:bg-muted flex min-h-9 items-center rounded-md px-2 text-sm"
                >
                  {m.titulo}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} className={estilo}>
          <Mail aria-hidden /> E-mail
        </a>
      ) : null}
    </div>
  );
}
