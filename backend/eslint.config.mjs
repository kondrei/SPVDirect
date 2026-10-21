import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { sonarjs, '@typescript-eslint': tseslint.plugin },
    rules: {
      ...sonarjs.configs.recommended.rules,
      '@typescript-eslint/prefer-optional-chain': 'error',
    },
  },
];
