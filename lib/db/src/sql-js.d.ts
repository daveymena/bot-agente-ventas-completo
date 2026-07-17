declare module "sql.js" {
  export interface Database {
    run(sql: string): void;
    export(): Uint8Array;
  }

  export interface SqlJsStatic {
    Database: {
      new (data?: Buffer | Uint8Array): Database;
    };
  }

  export interface InitSqlJsOptions {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>;
}
