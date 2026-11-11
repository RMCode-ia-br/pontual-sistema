import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <span className="bg-muted text-muted-foreground mb-4 flex size-14 items-center justify-center rounded-full">
        <SearchX className="size-7" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="text-muted-foreground mt-2 text-sm">O endereço não existe ou o item foi removido.</p>
      <Link href="/" className="bg-primary text-primary-foreground mt-6 inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium">
        Ir para o início
      </Link>
    </main>
  );
}
