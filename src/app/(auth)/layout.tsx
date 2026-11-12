import { obterMarcaOuPadrao } from "@/modules/configuracoes/queries";

export default async function LayoutAutenticacao({ children }: { children: React.ReactNode }) {
  // A tela de login nunca pode quebrar por causa de uma falha ao ler a configuração.
  const marca = await obterMarcaOuPadrao();

  return (
    <main className="from-primary/10 via-background to-background flex min-h-dvh items-center justify-center bg-gradient-to-b p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {marca.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage
            <img src={marca.logoUrl} alt="" className="mx-auto mb-3 size-12 rounded-xl object-contain" />
          ) : (
            <div className="bg-primary text-primary-foreground mx-auto mb-3 flex size-12 items-center justify-center rounded-xl text-xl font-bold" aria-hidden>
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
