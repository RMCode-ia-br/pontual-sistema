import { obterMarcaOuPadrao } from "@/modules/configuracoes/queries";

export default async function LayoutAutenticacao({ children }: { children: React.ReactNode }) {
  // A tela de login nunca pode quebrar por causa de uma falha ao ler a configuração.
  const marca = await obterMarcaOuPadrao();

  return (
    <main className="from-accent via-background to-background flex min-h-dvh items-center justify-center bg-gradient-to-b p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {marca.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage
            <img src={marca.logoUrl} alt="" className="mx-auto mb-4 size-24 rounded-full object-contain shadow-sm ring-1 ring-black/5" />
          ) : (
            <div className="bg-primary text-primary-foreground mx-auto mb-4 flex size-24 items-center justify-center rounded-full text-4xl font-bold shadow-sm" aria-hidden>
              {marca.nome.trim().charAt(0).toUpperCase() || "P"}
            </div>
          )}
          <h1 className="text-lg font-semibold tracking-tight">{marca.nome}</h1>
          <p className="text-muted-foreground text-sm">Sistema de gestão</p>
        </div>
        {children}
      </div>
    </main>
  );
}
