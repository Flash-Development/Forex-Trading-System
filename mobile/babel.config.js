module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
            '@theme': './src/theme',
            '@navigation': './src/navigation',
            '@stores': './src/stores',
            '@lib': './src/lib',
            '@components': './src/components',
            '@screens': './src/screens',
            '@types': './src/types',
          },
        },
      ],
      // Reanimated must be last
      'react-native-reanimated/plugin',
    ],
  }
}
