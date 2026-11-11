import { config } from "dotenv";

// Carrega o .env.local (o Vitest não o faz) antes de qualquer teste importar o cliente do banco.
config({ path: ".env.local", quiet: true });
