/* eslint-disable import/no-unresolved */
import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin';
import typescriptEslint from 'typescript-eslint';
import prettierPluginRecommended from 'eslint-plugin-prettier/recommended';
import typescriptParser from '@typescript-eslint/parser';
import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

const tsProjects = [
  './shared/tsconfig.json',
  './backend/tsconfig.json',
  './frontend/tsconfig.json',
];

export default [
  js.configs.recommended,
  importPlugin.flatConfigs.recommended,
  typescriptEslint.configs.eslintRecommended,
  prettierPluginRecommended,

  // https://stackoverflow.com/questions/58510287/parseroptions-project-has-been-set-for-typescript-eslint-parser
  ...typescriptEslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),

  {
    ignores: ['**/node_modules/', '**/build/', '**/dist/', '**/*d.ts'],
  },

  // shared rules for every TypeScript file
  {
    files: ['**/*.ts', '**/*.tsx'],

    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
    },

    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: tsProjects,
          noWarnOnMultipleProjects: true,
        },
      },
    },

    rules: {
      // typescript eslint
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/member-ordering': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],

      'import/no-named-as-default': 'error',

      // javascript
      'no-useless-return': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-promise-reject-errors': 'error',
      'prefer-regex-literals': 'error',
      radix: 'error',
    },
  },

  // backend + shared: node
  {
    files: ['backend/**/*.ts', 'shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // frontend: react in the browser
  {
    ...reactPlugin.configs.flat.recommended,
    files: ['frontend/**/*.tsx', 'frontend/**/*.ts'],
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['frontend/**/*.tsx', 'frontend/**/*.ts'],

    plugins: {
      'react-hooks': reactHooksPlugin,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },

    rules: {
      // for some reason, these can't be applied at top level
      ...reactHooksPlugin.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',

      // react
      'react/react-in-jsx-scope': 'off',
      'react/no-unescaped-entities': 'off',
      'react/jsx-closing-bracket-location': [
        'error',
        { location: 'line-aligned' },
      ],
      'react/jsx-curly-brace-presence': [
        'error',
        {
          props: 'never',
          children: 'never',
        },
      ],
      'react/jsx-fragments': 'error',
      'react/jsx-no-useless-fragment': 'error',
      'react/jsx-pascal-case': [
        'error',
        { allowAllCaps: true, allowNamespace: true },
      ],
      'react/self-closing-comp': 'error',

      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // plain JS config files (eslint-plugin-import pins ecmaVersion 2018, which rejects import.meta)
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
  },
];
