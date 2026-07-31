/**
 * app.config.js — dynamic Expo config
 * Injects environment variables into the Expo config at build time.
 * This replaces (or wraps) the static app.json for EAS builds.
 *
 * Usage:
 *   EXPO_PUBLIC_SUPABASE_URL=xxx eas build --profile production
 */

const IS_DEV     = process.env.APP_VARIANT === 'development'
const IS_PREVIEW = process.env.APP_VARIANT === 'preview'

const getAppName = () => {
  if (IS_DEV)     return 'VitaTrack (Dev)'
  if (IS_PREVIEW) return 'VitaTrack (Preview)'
  return 'VitaTrack'
}

const getBundleId = () => {
  if (IS_DEV)     return 'app.vitatrack.mobile.dev'
  if (IS_PREVIEW) return 'app.vitatrack.mobile.preview'
  return 'app.vitatrack.mobile'
}

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name:    getAppName(),
    slug:    'vitatrack',
    version: '1.0.0',
    scheme:  IS_DEV ? 'vitatrack-dev' : 'vitatrack',

    orientation: 'portrait',
    userInterfaceStyle: 'automatic',

    icon:   './assets/images/icon.png',
    splash: {
      image:           './assets/images/splash.png',
      resizeMode:      'contain',
      backgroundColor: '#1A569B',
    },

    assetBundlePatterns: ['**/*'],

    ios: {
      supportsTablet:      false,
      bundleIdentifier:    getBundleId(),
      buildNumber:         '1',
      infoPlist: {
        NSCameraUsageDescription:            'Used to scan QR codes and upload health documents.',
        NSPhotoLibraryUsageDescription:      'Used to attach health document images.',
        NSFaceIDUsageDescription:            'Used to lock the app when you are away.',
        NSHealthShareUsageDescription:       'VitaTrack does not read from Apple Health.',
        NSHealthUpdateUsageDescription:      'VitaTrack does not write to Apple Health.',
      },
    },

    android: {
      package:     getBundleId(),
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#D6D6D6',
      },
      permissions: [
        'USE_BIOMETRIC',
        'USE_FINGERPRINT',
        'CAMERA',
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
        'RECEIVE_BOOT_COMPLETED',
        'VIBRATE',
        'POST_NOTIFICATIONS',
      ],
      // Only attach the Firebase config if it's actually present. This lets
      // test/preview builds succeed without FCM (dose reminders use LOCAL
      // notifications). Add google-services.json later to enable remote push.
      ...(() => {
        const file = IS_DEV ? './google-services-dev.json' : './google-services.json'
        return process.env.EAS_BUILD && require('fs').existsSync(file)
          ? { googleServicesFile: file }
          : {}
      })(),
    },

    web: {
      bundler: 'metro',
      favicon: './assets/images/favicon.png',
    },

    plugins: [
      'expo-router',
      [
        'expo-notifications',
        {
          icon:            './assets/images/notification-icon.png',
          color:           '#1A569B',
          defaultChannel:  'vitatrack-dose',
          sounds:          ['./assets/sounds/notification.wav'],
        },
      ],
      [
        'expo-local-authentication',
        { faceIDPermission: 'Allow VitaTrack to use Face ID to unlock the app.' },
      ],
      [
        'expo-camera',
        { cameraPermission: 'Allow VitaTrack to access your camera for QR scanning and document uploads.' },
      ],
      'expo-secure-store',
      'expo-document-picker',
      'expo-web-browser',
      // Wires WatermelonDB's native Android build during prebuild. JSI is
      // disabled to match the app's bridge SQLiteAdapter and avoid the
      // duplicate libc++_shared.so packaging error.
      ['@morrowdigital/watermelondb-expo-plugin', { disableJsi: true }],
    ],

    updates: {
      url: 'https://u.expo.dev/01a4a792-812e-4207-b3f5-e3e07818ef3a',
    },
    runtimeVersion: {
      policy: 'appVersion',
    },

    experiments: {
      typedRoutes: true,
    },

    extra: {
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '01a4a792-812e-4207-b3f5-e3e07818ef3a',
      },
      supabaseUrl:    process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseKey:    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      iceBaseUrl:     process.env.EXPO_PUBLIC_ICE_BASE_URL ?? 'https://vita-track-life.vercel.app/ice',
    },
  },
}
