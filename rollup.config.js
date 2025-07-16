import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.js',
  external: ['stellar-sdk', 'axios'],
  output: [
    {
      file: 'dist/sofizpay-sdk.cjs.js',
      format: 'cjs',
      exports: 'default'
    },
    {
      file: 'dist/sofizpay-sdk.esm.js',
      format: 'es'
    },
    {
      file: 'dist/sofizpay-sdk.umd.js',
      format: 'umd',
      name: 'SofizPaySDK',
      exports: 'default',
      globals: {
        'stellar-sdk': 'StellarSdk',
        'axios': 'axios'
      }
    }
  ],
  plugins: [
    resolve()
  ]
};