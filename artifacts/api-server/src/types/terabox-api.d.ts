/**
 * `terabox-api` es JavaScript sin tipos, así que cada import suyo rompía el
 * typecheck con TS7016. No se tipa la librería entera a mano: lo que se usa
 * son tres métodos, y sus respuestas ya se validan en runtime por `errno`
 * (ver lib/terabox.ts), que es la única garantía real con una API no oficial.
 */
declare module "terabox-api" {
  export default class TeraBoxApp {
    constructor(ndus: string);
    checkLogin(): Promise<any>;
    getRemoteDir(dir: string, page?: number): Promise<any>;
    shareSet(paths: string[], password?: string, period?: number): Promise<any>;
  }
}
