import type {
  AnyDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";

type IndexedQuery = {
  withIndex(
    index: string,
    builder: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
  ): {
    unique(): Promise<Record<string, unknown> | null>;
    collect(): Promise<Record<string, unknown>[]>;
  };
};

export function queryTable(
  ctx: GenericQueryCtx<AnyDataModel> | GenericMutationCtx<AnyDataModel>,
  table: string,
): IndexedQuery {
  return ctx.db.query(table) as unknown as IndexedQuery;
}
