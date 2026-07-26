export type TableBlock = Readonly<{
  caption?: string;
  headers: readonly string[];
  id: string;
  rows: readonly (readonly string[])[];
  type: "table";
}>;
