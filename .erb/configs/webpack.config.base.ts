import path from 'path';
import { Configuration } from 'webpack';

const rootDir = path.resolve(__dirname, '../..');

const baseConfig: Configuration = {
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    alias: {
      '@renderer': path.resolve(rootDir, 'src/renderer'),
      '@modules': path.resolve(rootDir, 'src/modules'),
      '@appTypes': path.resolve(rootDir, 'src/types'),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  output: {
    path: path.resolve(rootDir, 'dist'),
  },
};

export default baseConfig;
