const HtmlWebpackPlugin = require('html-webpack-plugin')
const path = require('path')
const distDir = path.resolve(__dirname, 'dist')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: '[name].[contenthash].js',
    path: distDir
  },
  plugins: [
    new HtmlWebpackPlugin({
      // hash: true,
      minify: {
        collapseWhitespace: true,
        removeComments: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        useShortDoctype: true
      },
      template: './src/index.html'
    })
  ]
}
