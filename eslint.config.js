import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const focusMessage =
  "Opening a panel must not raise the tablet keyboard (#59, #87). Focus a field only from the handler of a Coach action that asked to type: call askToType in that handler and useFocusWhenAsked on the field, from apps/web/src/components/ask-to-type.ts.";
const effectHook = "/^use(Layout|Insertion)?Effect$/";

const fieldAutoFocus = {
  selector:
    'JSXOpeningElement[name.name=/^(input|textarea|select|[A-Z]\\w*)$/] > JSXAttribute[name.name="autoFocus"]',
  message: focusMessage,
};
const focusFromEffect = {
  selector: `CallExpression:matches([callee.name=${effectHook}], [callee.property.name=${effectHook}]) CallExpression[callee.property.name="focus"]`,
  message: focusMessage,
};
const focusFromRef = {
  selector:
    'JSXAttribute[name.name="ref"] CallExpression[callee.property.name="focus"]',
  message: focusMessage,
};

const restrictedSyntax = [fieldAutoFocus, focusFromEffect, focusFromRef];

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
