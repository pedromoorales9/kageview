import path from 'path';
import { Configuration } from 'webpack';
import { merge } from 'webpack-merge';
import baseConfig from './webpack.config.base';
import { anilistDefinePlugin } from './loadEnv';

const rootDir = path.resolve(__dirname, '../..');

const mainProdConfig: Configuration = merge(baseConfig, {
  mode: 'production',
  target: 'electron-main',
  entry: path.resolve(rootDir, 'src/main/main.ts'),
  output: {
    path: path.resolve(rootDir, 'dist/main'),
    filename: 'main.js',
  },
  plugins: [
    // Inyecta DISCORD_CLIENT_ID (y credenciales AniList) desde .env
    anilistDefinePlugin(),
  ],
  externals: {
    'electron-store': 'commonjs electron-store',
    'electron-updater': 'commonjs electron-updater',
  },
  node: {
    __dirname: false,
    __filename: false,
  },
});

export default mainProdConfig;
