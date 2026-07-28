module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // WatermelonDB models use legacy decorators (@field/@date/@json).
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      // reanimated's plugin must be listed LAST.
      'react-native-reanimated/plugin',
    ],
  }
}
