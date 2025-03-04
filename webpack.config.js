const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? false : 'inline-source-map',
    entry: {
      background: './src/background/index.js',
      content: './src/content/index.js',
      options: './src/options/index.js',
      history: './src/history/index.js',
      popup: './src/popup/index.js'
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env']
            }
          }
        },
        {
          test: /\.css$/,
          use: [
            isProd ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader'
          ]
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: 'asset/resource',
          generator: {
            filename: 'images/[name][ext]'
          }
        }
      ]
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { 
            from: './src/manifest.json', 
            to: 'manifest.json',
            transform(content) {
              // Generate manifest based on package.json info
              const manifest = JSON.parse(content.toString());
              return JSON.stringify(manifest, null, 2);
            } 
          },
          { from: './src/icons', to: 'icons' }
        ]
      }),
      new HtmlWebpackPlugin({
        template: './src/options/options.html',
        filename: 'options.html',
        chunks: ['options']
      }),
      new HtmlWebpackPlugin({
        template: './src/history/history.html',
        filename: 'history.html',
        chunks: ['history']
      }),
      new HtmlWebpackPlugin({
        template: './src/popup/popup.html',
        filename: 'popup.html',
        chunks: ['popup']
      }),
      isProd && new MiniCssExtractPlugin({
        filename: '[name].css'
      })
    ].filter(Boolean)
  };
};