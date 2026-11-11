import { removerUsuarioE2E } from "./banco";

export default async function globalTeardown() {
  await removerUsuarioE2E();
}
