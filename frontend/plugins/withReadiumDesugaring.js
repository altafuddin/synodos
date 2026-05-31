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

    // BUG-006 fix: force kotlinx-datetime to 0.6.x at the top level (sibling to
    // android {} / dependencies {}). Readium 3.1.0 references kotlinx.datetime.Instant,
    // which was removed in 0.7.0 (moved to kotlin.time.Instant). A plain implementation
    // pin loses to Gradle's highest-version conflict resolution, so we force it instead.
    const contents = config.modResults.contents;
    if (!contents.includes('BUG-006 fix')) {
      config.modResults.contents = contents + `
// BUG-006 fix: pin kotlinx-datetime to 0.6.x — Readium 3.1.0 references kotlinx.datetime.Instant, removed in 0.7.0
configurations.all {
    resolutionStrategy {
        force "org.jetbrains.kotlinx:kotlinx-datetime:0.6.1"
        force "org.jetbrains.kotlinx:kotlinx-datetime-jvm:0.6.1"
    }
}
`;
    }

    return config;
  });
};