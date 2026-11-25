import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const passTheErrorOn =
  "Bind it as catch (error) and pass it on. Rethrow it, or put describeFailure(error) in the reason the Coach reads, such as the save status or a failed outcome, and console.error it. When the browser refusing a storage API is the expected case, wrap the call in unlessBrowserRefuses from @chalk/local-db.";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.turbo/**", "**/convex/_generated/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Lint fails wherever a switch misses a kind of a union, such as a new
    // kind of FieldPick, and the error names the missing case. A default
    // branch does not count, since it would handle a new kind before anyone
    // chose how.
    files: ["packages/editor/src/**/*.ts", "apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: false },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: [
      "packages/editor/src/**/*.ts",
      "packages/local-db/src/**/*.ts",
      "packages/sync/src/**/*.ts",
      "apps/web/src/app/editor-runtime.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CatchClause[param=null]",
          message: `A catch with no binding throws the error away, so a failed save can look like it worked. ${passTheErrorOn}`,
        },
        {
          selector: "CatchClause[param.name=/^_/]",
          message: `A catch binding named to be ignored throws the error away, so a failed save can look like it worked. ${passTheErrorOn}`,
        },
        {
          selector:
            "CallExpression[callee.property.name='catch'] > :matches(ArrowFunctionExpression, FunctionExpression)[params.length=0]",
          message: `A .catch callback that takes no error throws it away, so a failed save can look like it worked. ${passTheErrorOn}`,
        },
        {
          selector:
            "CallExpression[callee.property.name='catch'] > :matches(ArrowFunctionExpression, FunctionExpression) > Identifier.params[name=/^_/]",
          message: `A .catch callback whose error is named to be ignored throws it away, so a failed save can look like it worked. ${passTheErrorOn}`,
        },
      ],
    },
  },
  {
    files: ["convex/**/*.ts"],
    rules: {
      // mutationGeneric / actionGeneric without generated bindings type ctx as any.
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    files: ["scripts/**/*.ts", "tests/**/*.ts", "vitest.config.ts"],
    languageOptions: { globals: { ...globals.node, Bun: "readonly" } },
  },
);
