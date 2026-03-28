const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withReadiumDesugaring(config) {
  return withAppBuildGradle(config, (config) => {
    const gradle = config.modResults.contents;

    // Add compileOptions with coreLibraryDesugaringEnabled if not already present
    if (!gradle.includes('coreLibraryDesugaringEnabled true')) {
      if (gradle.includes('compileOptions')) {
        // compileOptions block exists — inject inside it
        config.modResults.contents = gradle.replace(
          /compileOptions\s*\{([^}]*)\}/,
          (match, inner) => {
            return `compileOptions {${inner}        coreLibraryDesugaringEnabled true\n    }`;
          }
        );
      } else {
        // No compileOptions block — create one inside android {}
        config.modResults.contents = gradle.replace(
          /android\s*\{/,
          `android {\n    compileOptions {\n        coreLibraryDesugaringEnabled true\n    }`
        );
      }
    }

    // Add desugar_jdk_libs dependency if not already present
    const updatedGradle = config.modResults.contents;
    if (!updatedGradle.includes('desugar_jdk_libs')) {
      config.modResults.contents = updatedGradle.replace(
        /dependencies\s*\{/,
        `dependencies {\n    coreLibraryDesugaring "com.android.tools:desugar_jdk_libs:2.1.2"`
      );
    }

    return config;
  });
};