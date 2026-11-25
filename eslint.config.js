import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const passTheErrorOn =
  "Bind it as catch (error) and pass it on. Rethrow it, or put describeFailure(error) in the reason the Coach reads, such as the save status or a failed outcome, and console.error it. When the browser refusing a storage API is the expected case, wrap the call in unlessBrowserRefuses from @chalk/local-db.";

/**
 * Every no-restricted-syntax rule, with the files it covers and the files it
 * leaves out. A later block's no-restricted-syntax replaces an earlier one
 * for the same file instead of adding to it, so the rules are only ever set
 * through composeRestrictedSyntax below.
 */
const restrictedSyntax = [
  {
    files: [
      "packages/editor/src/**/*.ts",
      "packages/local-db/src/**/*.ts",
      "packages/sync/src/**/*.ts",
      "apps/web/src/app/editor-runtime.ts",
    ],
    rules: [
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
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    // The one module that listens for a press anywhere on the page.
    ignores: ["apps/web/src/components/page-press.ts"],
    rules: [
      {
        selector: [
          "CallExpression",
          ':matches([callee.name="addEventListener"], [callee.property.name="addEventListener"]:matches([callee.object.name=/^(window|document|globalThis|self)$/], [callee.object.property.name=/^(document|body|documentElement|ownerDocument)$/]))',
          "[arguments.0.value=/^(pointerdown|mousedown|touchstart)$/]",
        ].join(""),
        message:
          "Close a panel on a press past it with useDismissOnPressOutside from apps/web/src/components/page-press.ts. A press listener on the page written by hand heard the press after a field handle had stopped it, so the panel stayed open (#240), and it caught the press that had just opened the panel (#211).",
      },
    ],
  },
];

/**
 * One config block for each set of entries, smallest sets first. Its files
 * are the files every entry in the set covers, and its rules are all their
 * rules. A file covered by several entries matches each subset of them, and
 * the last block it matches is the one that holds every entry covering it,
 * so it gets the union.
 */
const composeRestrictedSyntax = (entries) =>
  entries
    .reduce(
      (sets, entry) => [...sets, ...sets.map((set) => [...set, entry])],
      [[]],
    )
    .filter((set) => set.length > 0)
    .sort((a, b) => a.length - b.length)
    .map((set) => ({
      // An inner array is matched when the file matches every pattern in it.
      files: set.reduce(
        (all, entry) =>
          all.flatMap((patterns) =>
            entry.files.map((file) => [...patterns, file]),
          ),
        [[]],
      ),
      ignores: set.flatMap((entry) => entry.ignores ?? []),
      rules: {
        "no-restricted-syntax": [
          "error",
          ...set.flatMap((entry) => entry.rules),
        ],
      },
    }));

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
  ...composeRestrictedSyntax(restrictedSyntax),
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
