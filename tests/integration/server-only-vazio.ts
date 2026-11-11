// "server-only" lança erro fora do ambiente de servidor do Next. Nos testes de integração (Node puro) ele não protege nada,
// então é trocado por este módulo vazio (alias em vitest.integracao.config.mts).
export {};
