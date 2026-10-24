import workspaceConfig from "./apps/studio/eslint.config.js";

const [recommendedConfig, typescriptConfig] = workspaceConfig;

export default [
  recommendedConfig,
  {
    languageOptions: {
      globals: typescriptConfig.languageOptions.globals,
    },
  },
  typescriptConfig,
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "code_analysis_results/**",
    ],
  },
];
