import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const pagePressListener = {
  selector: [
    "CallExpression",
    ':matches([callee.name="addEventListener"], [callee.property.name="addEventListener"]:matches([callee.object.name=/^(window|document|globalThis|self)$/], [callee.object.property.name=/^(document|body|documentElement|ownerDocument)$/]))',
    "[arguments.0.value=/^(pointerdown|mousedown|touchstart)$/]",
  ].join(""),
  message:
    "Close a panel on a press past it with useDismissOnPressOutside from apps/web/src/components/page-press.ts. A press listener on the page written by hand heard the press after a field handle had stopped it, so the panel stayed open (#240), and it caught the press that had just opened the panel (#211).",
};

const restrictedSyntax = [pagePressListener];

/**
 * The restricted syntax minus the rules a file is the one home for. A bare
 * "error" would keep the earlier block's selectors, so an empty list is
 * "off".
 */
const restrictedSyntaxExcept = (...allowed) => {
  const rest = restrictedSyntax.filter((rule) => !allowed.includes(rule));
  return rest.length > 0 ? ["error", ...rest] : "off";
};

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
      "no-restricted-syntax": ["error", ...restrictedSyntax],
    },
  },
  {
    files: ["apps/web/src/components/page-press.ts"],
    rules: {
      "no-restricted-syntax": restrictedSyntaxExcept(pagePressListener),
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
