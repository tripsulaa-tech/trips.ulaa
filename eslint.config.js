import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Allow deliberately-unused `_`-prefixed vars/args (e.g. props a
      // component accepts-and-ignores for API-compat, destructured only to
      // exclude them from a `...rest` spread).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // One notification system: confirmations go through useToast(), errors that need
      // acknowledging through useAlert(). Don't build a local toast or call the browser's alert().
      'no-restricted-globals': ['error', { name: 'alert', message: "Use useToast() for confirmations or useAlert() for errors that need an OK." }],
      'no-restricted-syntax': ['error', {
        selector: "VariableDeclarator[id.type='ArrayPattern'][id.elements.0.name='toast']",
        message: 'Use useToast() from components/ui/useToast instead of a local toast state.',
      }],
    },
  },
])
