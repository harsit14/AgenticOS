import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['**/dist', '**/.next', '**/node_modules'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'warn',
    },
    plugins: {
      '@typescript-eslint': await import('@typescript-eslint/eslint-plugin'),
    },
    languageOptions: {
      parser: await import('@typescript-eslint/parser'),
    },
  },
  eslintConfigPrettier,
];