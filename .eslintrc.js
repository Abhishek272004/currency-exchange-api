module.exports = {
  env: {
    es2021: true,
    node: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:jest/recommended',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  rules: {
    // Basic rules
    'no-console': 'warn',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'warn',
    'prefer-template': 'warn',
    'prefer-arrow-callback': 'warn',
    'no-param-reassign': 'error',
    'no-await-in-loop': 'warn',
    'require-await': 'warn',
    'no-return-await': 'warn',
    'no-promise-executor-return': 'error',
    'no-template-curly-in-string': 'warn',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
    'no-else-return': ['error', { allowElseIf: false }],
    'no-implicit-coercion': 'error',
    'no-lonely-if': 'error',
    'no-unneeded-ternary': 'error',
    'one-var': ['error', 'never'],
    'prefer-destructuring': ['warn', { object: true, array: false }],
    'spaced-comment': ['warn', 'always', { markers: ['/'] }],
    'no-multi-spaces': 'warn',
    'no-multiple-empty-lines': ['warn', { max: 1, maxEOF: 1 }],
    'no-trailing-spaces': 'warn',
    'eol-last': ['warn', 'always'],
    'comma-dangle': ['warn', 'always-multiline'],
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
    'indent': ['error', 2, { SwitchCase: 1 }],
    
    // Node.js specific rules
    'node/no-unsupported-features/es-syntax': 'off',
    'node/no-missing-require': 'off',
    'node/no-unpublished-require': 'off',
    'node/no-unpublished-import': 'off',
    
    // Jest rules
    'jest/no-disabled-tests': 'warn',
    'jest/no-focused-tests': 'error',
    'jest/no-identical-title': 'error',
    'jest/prefer-to-have-length': 'warn',
    'jest/valid-expect': 'error',
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/__tests__/**/*.js'],
      rules: {
        'no-console': 'off',
        'no-magic-numbers': 'off',
      },
    },
  ],
};
