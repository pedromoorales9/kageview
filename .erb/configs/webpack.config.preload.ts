import path from 'path';
import { Configuration } from 'webpack';
import { merge } from 'webpack-merge';
import baseConfig from './webpack.config.base';

const rootDir = path.resolve(__dirname, '../..');

const preloadConfig: Configuration = merge(baseConfig, {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  target: 'electron-preload',
  entry: path.resolve(rootDir, 'src/main/preload.ts'),
  output: {
    path: path.resolve(rootDir, 'dist/main'),
    filename: 'preload.js',
  },
  node: {
    __dirname: false,
    __filename: false,
  },
});

export default preloadConfig;
