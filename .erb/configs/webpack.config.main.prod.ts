import path from 'path';
import { Configuration } from 'webpack';
import { merge } from 'webpack-merge';
import baseConfig from './webpack.config.base';

const rootDir = path.resolve(__dirname, '../..');

const mainProdConfig: Configuration = merge(baseConfig, {
  mode: 'production',
  target: 'electron-main',
  entry: path.resolve(rootDir, 'src/main/main.ts'),
  output: {
    path: path.resolve(rootDir, 'dist/main'),
    filename: 'main.js',
  },
  externals: {
    'electron-store': 'commonjs electron-store',
    'electron-updater': 'commonjs electron-updater',
    'discord-rpc': 'commonjs discord-rpc',
  },
  node: {
    __dirname: false,
    __filename: false,
  },
});

export default mainProdConfig;
