const { withPlugins, withInfoPlist, withAndroidManifest, withAppBuildGradle, withXcodeProject } = require('@expo/config-plugins');

// Custom plugin to configure Agora for iOS and Android
const withAgora = (config) => {
  // Add iOS configuration
  config = withInfoPlist(config, (config) => {
    config.modResults.NSCameraUsageDescription = 
      config.modResults.NSCameraUsageDescription || 
      'This app needs camera access to enable video calls';
      
    config.modResults.NSMicrophoneUsageDescription = 
      config.modResults.NSMicrophoneUsageDescription || 
      'This app needs microphone access to enable voice calls';
      
    return config;
  });

  // Add Android permissions
  config = withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application[0];
    
    // Ensure permissions exist
    if (!config.modResults.manifest['uses-permission']) {
      config.modResults.manifest['uses-permission'] = [];
    }
    
    const permissions = [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE'
    ];
    
    permissions.forEach(permission => {
      if (!config.modResults.manifest['uses-permission'].some(p => p.$['android:name'] === permission)) {
        config.modResults.manifest['uses-permission'].push({
          $: {
            'android:name': permission
          }
        });
      }
    });
    
    return config;
  });

  // Add Agora dependency to build.gradle
  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.match(/io.agora.rtc:full-sdk/)) {
      config.modResults = config.modResults.replace(
        /dependencies\s?{/,
        `dependencies {
    implementation 'io.agora.rtc:full-sdk:4.2.2'`
      );
    }
    return config;
  });

  return config;
};

module.exports = function withCustomConfig(config) {
  return withPlugins(config, [
    withAgora
  ]);
}; 