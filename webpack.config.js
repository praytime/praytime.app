const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')

const path = require('path')
const srcDir = path.resolve(__dirname, 'src')
const staticDir = path.resolve(srcDir, 'static')
const distDir = path.resolve(__dirname, 'dist')

module.exports = [
  {
    entry: './src/index.js',
    output: {
      filename: '[name].[contenthash].js',
      path: distDir
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: staticDir, to: distDir }
        ]
      }),
      new HtmlWebpackPlugin({
        template: './src/index.html'
      })
    ]
  }, {
    entry: './src/sw.js',
    output: {
      filename: 'sw.js',
      path: distDir
    }
  }, {
    entry: './src/firebase-messaging-sw.js',
    output: {
      filename: 'firebase-messaging-sw.js',
      path: distDir
    }
  }
]
