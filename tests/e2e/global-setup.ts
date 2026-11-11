import { prepararUsuarioE2E } from "./banco";

export default async function globalSetup() {
  await prepararUsuarioE2E();
}
