import path from 'path';
import { Configuration as WebpackConfig } from 'webpack';
import { Configuration as DevServerConfig } from 'webpack-dev-server';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { merge } from 'webpack-merge';
import baseConfig from './webpack.config.base';

const rootDir = path.resolve(__dirname, '../..');

interface Config extends WebpackConfig {
  devServer?: DevServerConfig;
}

const rendererDevConfig: Config = merge(baseConfig as WebpackConfig, {
  mode: 'development',
  target: 'web',
  entry: path.resolve(rootDir, 'src/renderer/index.tsx'),
  output: {
    path: path.resolve(rootDir, 'dist/renderer'),
    filename: 'renderer.js',
    publicPath: '/',
  },
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
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
  ],
  devServer: {
    port: 1212,
    hot: true,
    compress: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
    static: {
      publicPath: '/',
    },
    historyApiFallback: true,
  },
});

export default rendererDevConfig;
