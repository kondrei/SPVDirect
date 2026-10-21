import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import react from 'eslint-plugin-react';

export default [
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: '19.0' } },
    plugins: { sonarjs, react, '@typescript-eslint': tseslint.plugin },
    rules: {
      ...sonarjs.configs.recommended.rules,
      '@typescript-eslint/prefer-optional-chain': 'error',
      'react/jsx-child-element-spacing': 'error',
    },
  },
];
