import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config(
  { ignores: ['dist', 'src/api/generated/**', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.{ts,tsx}'], languageOptions: { globals: {...globals.browser,...globals.node} }, rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
);
