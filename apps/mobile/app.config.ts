import type { ExpoConfig } from "expo/config";

const SCHEME = "htg";

const config: ExpoConfig = {
  name: "HTG",
  slug: "htg-mobile",
  version: "0.1.0",
  orientation: "portrait",
  scheme: SCHEME,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#000000",
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    bundleIdentifier: "com.htgcyou.mobile",
    supportsTablet: true,
    buildNumber: "1",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ["audio"],
      NSMicrophoneUsageDescription:
        "HTG uses the microphone during live sessions so you can speak with other participants.",
      NSCameraUsageDescription:
        "HTG may request camera access for future video session features. It is not used in audio-only sessions.",
      NSUserTrackingUsageDescription:
        "We do not track you across apps. This permission is declared for future analytics opt-in only.",
    },
    associatedDomains: ["applinks:htgcyou.com"],
    config: {
      usesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.htgcyou.mobile",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#000000",
    },
    permissions: [
      "RECORD_AUDIO",
      "MODIFY_AUDIO_SETTINGS",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "POST_NOTIFICATIONS",
      "WAKE_LOCK",
      "INTERNET",
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "htgcyou.com", pathPrefix: "/m" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-localization",
    "expo-apple-authentication",
    "expo-web-browser",
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#000000",
      },
    ],
    [
      "expo-build-properties",
      {
        ios: {
          deploymentTarget: "16.0",
          useFrameworks: "static",
        },
        android: {
          minSdkVersion: 26,
          compileSdkVersion: 35,
          targetSdkVersion: 35,
        },
      },
    ],
    [
      "@livekit/react-native-expo-plugin",
      {
        bypassVoiceProcessing: false,
      },
    ],
    [
      "@config-plugins/react-native-webrtc",
      {
        cameraPermission: "HTG does not use the camera in audio-only sessions.",
        microphonePermission:
          "HTG uses the microphone during live sessions so you can speak with other participants.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {
      origin: false,
    },
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
  updates: {
    url: process.env.EAS_UPDATE_URL,
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  owner: "htgcyou",
};

export default config;
