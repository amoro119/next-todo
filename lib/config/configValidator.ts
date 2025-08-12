// lib/config/configValidator.ts
import { getUserState } from '../user/userState';
import { getSyncConfig } from './syncConfig';
import { getDistributionConfig } from './distributionConfig';

export interface ConfigValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  recommendations: string[];
}

export const validateConfiguration = (): ConfigValidationResult => {
  const result: ConfigValidationResult = {
    isValid: true,
    warnings: [],
    errors: [],
    recommendations: [],
  };

  const userState = getUserState();
  const syncConfig = getSyncConfig();
  const distributionConfig = getDistributionConfig();

  // 1. 检查用户订阅状态与分发版本的一致性
  if (distributionConfig.buildType === 'free' && userState.subscription !== 'free') {
    result.recommendations.push(
      `用户订阅状态 (${userState.subscription}) 与免费版本构建不匹配，已自动调整`
    );
  }

  if (distributionConfig.buildType === 'premium' && userState.subscription === 'free') {
    result.recommendations.push(
      '用户订阅状态 (免费版) 与高级版本构建不匹配，已自动调整'
    );
  }

  // 2. 检查同步配置的一致性
  if (userState.subscription === 'free' && syncConfig.enabled) {
    result.errors.push(
      '配置不一致：免费用户不应启用同步功能'
    );
    result.isValid = false;
  }

  if (distributionConfig.buildType === 'free' && distributionConfig.syncEnabled) {
    result.errors.push(
      '配置不一致：免费版本构建不应默认启用同步'
    );
    result.isValid = false;
  }

  // 3. 检查功能可用性
  const availableFeatures = distributionConfig.features;
  
  // 根据构建类型检查必需功能
  let requiredFeatures: string[] = [];
  
  if (distributionConfig.buildType === 'free') {
    requiredFeatures = ['basic-export'];
  } else if (distributionConfig.buildType === 'premium') {
    requiredFeatures = ['export']; // 高级版使用 export 而不是 basic-export
  }

  requiredFeatures.forEach(feature => {
    if (!availableFeatures.includes(feature)) {
      result.errors.push(
        `缺少必需功能: ${feature}`
      );
      result.isValid = false;
    }
  });

  // 4. 提供建议
  if (distributionConfig.buildType === 'free' && !distributionConfig.showUpgradePrompts) {
    result.recommendations.push(
      '免费版本建议启用升级提示以引导用户升级'
    );
  }

  if (userState.subscription !== 'free' && !syncConfig.enabled && syncConfig.reason === 'user_preference') {
    result.recommendations.push(
      '付费用户可能希望启用同步功能以获得更好的体验'
    );
  }

  // 5. 检查环境变量
  if (typeof window !== 'undefined') {
    // 检查关键环境变量是否可用
    const electricProxyUrl = process.env.NEXT_PUBLIC_ELECTRIC_PROXY_URL;
    
    if (!electricProxyUrl || electricProxyUrl === 'undefined') {
      result.warnings.push(
        '缺少环境变量: NEXT_PUBLIC_ELECTRIC_PROXY_URL'
      );
    }
  }

  return result;
};

export const logConfigurationStatus = () => {
  const validation = validateConfiguration();
  const userState = getUserState();
  const syncConfig = getSyncConfig();
  const distributionConfig = getDistributionConfig();

  console.group('📋 配置状态检查');
  
  console.log('用户状态:', {
    subscription: userState.subscription,
    syncEnabled: userState.syncEnabled,
  });
  
  console.log('同步配置:', {
    enabled: syncConfig.enabled,
    reason: syncConfig.reason,
  });
  
  console.log('分发配置:', {
    buildType: distributionConfig.buildType,
    appName: distributionConfig.appName,
    features: distributionConfig.features,
  });

  if (validation.errors.length > 0) {
    console.error('❌ 配置错误:', validation.errors);
  }

  if (validation.warnings.length > 0) {
    console.warn('⚠️ 配置警告:', validation.warnings);
  }

  if (validation.recommendations.length > 0) {
    console.info('💡 建议:', validation.recommendations);
  }

  if (validation.isValid) {
    console.log('✅ 配置验证通过');
  } else {
    console.error('❌ 配置验证失败');
  }

  console.groupEnd();

  return validation;
};