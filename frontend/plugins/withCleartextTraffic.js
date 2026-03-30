const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const { writeFileSync, mkdirSync } = require('fs');
const { resolve } = require('path');

module.exports = function withCleartextTraffic(config) {
  // Step 1: Write network_security_config.xml that permits cleartext
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const resXmlDir = resolve(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/xml'
      );
      mkdirSync(resXmlDir, { recursive: true });

      const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>`;

      writeFileSync(
        resolve(resXmlDir, 'network_security_config.xml'),
        networkSecurityConfig
      );

      return config;
    },
  ]);

  // Step 2: Reference it in the manifest + set usesCleartextTraffic
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
      application.$['android:networkSecurityConfig'] =
        '@xml/network_security_config';
    }
    return config;
  });

  return config;
};
