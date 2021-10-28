const HtmlWebpackPlugin = require('html-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')

const path = require('path')
const srcDir = path.resolve(__dirname, 'src')
const staticDir = path.resolve(srcDir, 'static')
const distDir = path.resolve(__dirname, 'dist')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: '[name].[contenthash].js',
    path: distDir
  },
  plugins: [
    new CleanWebpackPlugin(),
    new CopyWebpackPlugin({
      patterns: [
        { from: staticDir, to: distDir }
      ]
    }),
    new HtmlWebpackPlugin({
      template: './src/index.html'
    })
  ]
}
