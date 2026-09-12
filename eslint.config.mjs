// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'eslint.config.mjs',
      'vitest.config.ts',
      'vitest.setup.ts',
      'drizzle.config.ts',
      'ecosystem.config.cjs',
      'tools/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // Without this the resolver only looks for .js and every TS import reads as an
      // unresolvable "unknown" element.
      'import/resolver': {
        node: { extensions: ['.ts', '.js', '.json'] },
      },
      // Order matters: the first matching pattern wins.
      'boundaries/elements': [
        { type: 'entrypoint', pattern: 'src/*.ts', mode: 'file' },
        { type: 'common', pattern: 'src/common/**' },
        // Split out from 'module' so table definitions can reference each other for
        // foreign keys without opening the door to cross-module queries.
        { type: 'schema', pattern: 'src/*/db/**', capture: ['moduleName'] },
        // R-7: a module's public port is the only cross-module import target.
        { type: 'port', pattern: 'src/*/public/**', capture: ['moduleName'] },
        { type: 'module', pattern: 'src/*/**', capture: ['moduleName'] },
      ],
    },
    rules: {
      // Nest modules are decorated marker classes and are legitimately empty.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],

      // R-7: common/ holds infrastructure only and may never reach into a module;
      // modules talk to each other through ports, never directly.
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'entrypoint', allow: ['entrypoint', 'common', 'module', 'port'] },
            { from: 'common', allow: ['common'] },
            // Foreign keys cross module lines, so a table definition may import another
            // module's table definition. Nothing else may.
            { from: 'schema', allow: ['common', 'schema'] },
            // Ports are contracts: types and DI tokens only, no implementation.
            { from: 'port', allow: ['common', 'port'] },
            {
              from: 'module',
              allow: [
                'common',
                ['module', { moduleName: '${from.moduleName}' }],
                // A module reads its OWN tables only — never another module's.
                ['schema', { moduleName: '${from.moduleName}' }],
                // …but may depend on ANY module's published contract.
                'port',
              ],
            },
          ],
        },
      ],
      'boundaries/no-unknown': 'error',
      'boundaries/no-unknown-files': 'error',
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      // R-7 exists to stop PRODUCTION coupling between modules. An integration test
      // legitimately wires two real modules together — assets + projects, to prove the
      // ownership check actually holds — and substituting a fake there would weaken
      // exactly the test P2's exit criterion depends on. Specs ship to nobody.
      'boundaries/element-types': 'off',
    },
  },
  prettier,
);
