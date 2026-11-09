const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const appDelegateDeclaration = 'class AppDelegate: ExpoAppDelegate {';
const legacySceneStartup = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('Bloom scene lifecycle requires a Swift AppDelegate.');
    }

    let contents = config.modResults.contents;
    if (!contents.includes('ExpoReactNativeFactoryProvider')) {
      if (!contents.includes(appDelegateDeclaration)) {
        throw new Error('Could not find the expected Expo AppDelegate declaration.');
      }
      if (!contents.includes(legacySceneStartup)) {
        throw new Error('Could not find the expected legacy React Native window startup block.');
      }

      contents = contents
        .replace(
          appDelegateDeclaration,
          'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'
        )
        .replace(legacySceneStartup, '');
    }

    config.modResults.contents = contents;
    return config;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return config;
  });
}

module.exports = function withIOSSceneLifecycle(config) {
  return withSceneManifest(withSceneAppDelegate(config));
};
