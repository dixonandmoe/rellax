import next from 'eslint-config-next';

/**
 * ESLint flat config.
 *
 * Next 16 removed the `next lint` wrapper, so eslint runs directly and
 * `eslint-config-next` is consumed as a native flat config array.
 */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...next,
  {
    rules: {
      // The domain engines use non-null assertions after explicit length and membership
      // checks. Replacing them with optional chaining would hide real invariants.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];

export default config;
