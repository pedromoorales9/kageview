import path from 'path';
import { Configuration } from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { merge } from 'webpack-merge';
import baseConfig from './webpack.config.base';

const rootDir = path.resolve(__dirname, '../..');

const rendererProdConfig: Configuration = merge(baseConfig, {
  mode: 'production',
  target: 'web',
  entry: path.resolve(rootDir, 'src/renderer/index.tsx'),
  output: {
    path: path.resolve(rootDir, 'dist/renderer'),
    filename: 'renderer.js',
    publicPath: './',
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'postcss-loader',
        ],
      },
      {
        test: /\.(png|jpe?g|gif|svg|ico|icns)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(rootDir, 'src/renderer/index.html'),
      filename: 'index.html',
    }),
    new MiniCssExtractPlugin({
      filename: 'styles.css',
    }),
  ],
});

export default rendererProdConfig;
