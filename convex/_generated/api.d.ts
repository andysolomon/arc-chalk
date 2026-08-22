import type { AnyApi, FilterApi, FunctionReference } from "convex/server";

export declare const api: FilterApi<AnyApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<
  AnyApi,
  FunctionReference<any, "internal">
>;
export declare const components: AnyApi;
