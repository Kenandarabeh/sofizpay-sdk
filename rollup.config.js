import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.js',
  external: ['stellar-sdk', 'axios', 'node-forge'],
  output: [
    {
      file: 'dist/sofizpay-sdk.cjs.js',
      format: 'cjs',
      exports: 'auto'
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
        'axios': 'axios',
        'node-forge': 'forge'
      }
    }

  ],
  plugins: [
    resolve()
  ]
};