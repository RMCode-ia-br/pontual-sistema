import { formatarTelefone } from "@/lib/formatadores";

import type { listarContatos, listarEnderecos } from "../queries";

/**
 * Ficha do cliente SOMENTE PARA LER (Fase 7C): quem só "pode ver" Clientes (o Campo) enxerga nome, telefone, endereço e
 * contatos, sem formulário de edição e sem CPF/CNPJ, e-mail, origem nem observações (que nem chegam à tela).
 */
type Dados = { nome: string; nomeFantasia: string | null; telefone: string | null; whatsapp: string | null };
type Endereco = Awaited<ReturnType<typeof listarEnderecos>>[number];
type Contato = Awaited<ReturnType<typeof listarContatos>>[number];

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function DadosSomenteLeitura({ cliente }: { cliente: Dados }) {
  return (
    <dl className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2" aria-label="Dados do cliente">
      <Linha rotulo="Nome">{cliente.nome}</Linha>
      <Linha rotulo="Nome fantasia">{cliente.nomeFantasia}</Linha>
      <Linha rotulo="Telefone">{cliente.telefone ? formatarTelefone(cliente.telefone) : null}</Linha>
      <Linha rotulo="WhatsApp">{cliente.whatsapp ? formatarTelefone(cliente.whatsapp) : null}</Linha>
    </dl>
  );
}

export function EnderecosSomenteLeitura({ enderecos }: { enderecos: Endereco[] }) {
  if (enderecos.length === 0) return <p className="text-muted-foreground text-sm">Nenhum endereço cadastrado.</p>;
  return (
    <ul className="grid gap-3" aria-label="Endereços do cliente">
      {enderecos.map((e) => {
        const linha1 = [e.logradouro, e.numero].filter(Boolean).join(", ");
        const linha2 = [e.complemento, e.bairro].filter(Boolean).join(" · ");
        const linha3 = [[e.cidade, e.uf].filter(Boolean).join("/"), e.cep].filter(Boolean).join(" · ");
        return (
          <li key={e.id} className="grid gap-0.5 rounded-xl border p-4 text-sm">
            {e.apelido ? <strong>{e.apelido}</strong> : null}
            {linha1 ? <span>{linha1}</span> : null}
            {linha2 ? <span className="text-muted-foreground">{linha2}</span> : null}
            {linha3 ? <span className="text-muted-foreground">{linha3}</span> : null}
            {e.condominio ? (
              <span className="text-muted-foreground">
                Condomínio{e.condominioNome ? `: ${e.condominioNome}` : ""}
                {e.horariosPermitidos ? ` · horários: ${e.horariosPermitidos}` : ""}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ContatosSomenteLeitura({ contatos }: { contatos: Contato[] }) {
  if (contatos.length === 0) return <p className="text-muted-foreground text-sm">Nenhum contato cadastrado.</p>;
  return (
    <ul className="grid gap-3" aria-label="Contatos do cliente">
      {contatos.map((c) => (
        <li key={c.id} className="grid gap-0.5 rounded-xl border p-4 text-sm">
          <strong>{c.nome}</strong>
          {c.cargo ? <span className="text-muted-foreground">{c.cargo}</span> : null}
          {c.telefone || c.whatsapp ? <span>{formatarTelefone(c.whatsapp || c.telefone)}</span> : null}
        </li>
      ))}
    </ul>
  );
}
