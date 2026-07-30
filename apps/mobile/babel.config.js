module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // WatermelonDB models use legacy decorators (@field/@date/@json).
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      // Reanimated 4 moved its Babel plugin into react-native-worklets.
      // Must be listed LAST.
      'react-native-worklets/plugin',
    ],
  }
}
