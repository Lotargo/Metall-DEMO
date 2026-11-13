// Flat ESLint config for metall-web.
// Day-one policy: recommended sets, zero errors on the existing codebase.
// Warnings are informational (no --max-warnings in `npm run lint`);
// tighten individual rules from warn -> error as the code is cleaned.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'node_modules/.tmp/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // `any` is widespread in API-boundary code (usage snapshots, payloads);
      // warn for now, new code should prefer `unknown` + narrowing.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
