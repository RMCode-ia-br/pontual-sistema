"use client";

import { COR_PADRAO_DO_SISTEMA, TEXTO_SOBRE_MARCA } from "@/lib/tema/derivar";

// Último recurso: substitui o layout raiz, então precisa trazer o próprio <html> e estilos mínimos.
export default function ErroGlobal({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 16 }}>
        <div role="alert" style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>O sistema encontrou um problema</h1>
          <p style={{ color: "#555", fontSize: 14, margin: "0 0 12px" }}>
            Tente de novo. Se continuar, avise a RM Code{error.digest ? ` informando o código ${error.digest}` : ""}.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ background: COR_PADRAO_DO_SISTEMA, color: TEXTO_SOBRE_MARCA.claro, border: 0, borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer" }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
