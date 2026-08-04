export function importedSpecifiers(source: string): string[] {
  const pattern = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
  return Array.from(source.matchAll(pattern), (match) => match[1]).filter(
    (specifier): specifier is string => specifier !== undefined,
  );
}

export function findForbiddenImports(
  source: string,
  forbidden: readonly string[],
): string[] {
  return importedSpecifiers(source).filter((specifier) =>
    forbidden.some(
      (blocked) =>
        specifier === blocked ||
        specifier.startsWith(blocked.endsWith("/") ? blocked : `${blocked}/`),
    ),
  );
}
