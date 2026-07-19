import type { DataSourceProviderAdapter } from "../../../../core/intelligence";
import type { GoogleSearchConsoleService } from "../google/GoogleSearchConsoleService";

export class GoogleSearchConsoleAdapter implements DataSourceProviderAdapter {
  readonly provider = "googleSearchConsole" as const;
  constructor(private readonly searchConsole: Pick<GoogleSearchConsoleService, "sync">) {}
  sync(connection: Parameters<DataSourceProviderAdapter["sync"]>[0], request: Parameters<DataSourceProviderAdapter["sync"]>[1]) { return this.searchConsole.sync(connection, request); }
}
