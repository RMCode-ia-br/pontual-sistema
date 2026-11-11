/**
 * Dados de DEMONSTRAÇÃO (clientes, projetos, propostas, obras e lançamentos claramente fictícios).
 * Ainda não existe: as tabelas desses módulos chegam nas Fases 1 a 6 e o seed acompanha cada uma.
 * Quando existir, só rodará em desenvolvimento (recusa NODE_ENV=production e exige ALLOW_DEMO_SEED=true).
 */
console.error("seed:demo ainda não está disponível: os módulos de clientes, projetos e financeiro chegam nas próximas fases.");
process.exitCode = 1;
