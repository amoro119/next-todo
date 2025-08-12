// lib/config/distributionConfig.ts
export interface DistributionConfig {
  defaultSubscription: 'free' | 'premium' | 'pro';
  syncEnabled: boolean;
  showUpgradePrompts: boolean;
  features: string[];
  appName: string;
  version: string;
  buildType: 'free' | 'premium';
}

const DEFAULT_CONFIG: DistributionConfig = {
  defaultSubscription: 'premium',
  syncEnabled: true,
  showUpgradePrompts: false,
  features: ['sync', 'export', 'themes', 'advanced-search'],
  appName: 'Todo App',
  version: '1.0.0',
  buildType: 'premium',
};

let cachedConfig: DistributionConfig | null = null;

export const loadDistributionConfig = async (): Promise<DistributionConfig> => {
  // 如果已经缓存，直接返回
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    // 在开发模式下，检查环境变量来决定加载哪个配置
    const isDev = process.env.NODE_ENV === 'development';
    const distribution = process.env.NEXT_PUBLIC_DISTRIBUTION || 'premium';
    
    let configUrl = '/config.json';
    
    if (isDev) {
      // 开发模式下使用特定的配置文件
      configUrl = `/config-dev-${distribution}.json`;
      console.log(`开发模式：尝试加载 ${distribution} 版本配置`);
    }
    
    const response = await fetch(configUrl);
    if (response.ok) {
      const config = await response.json();
      cachedConfig = { ...DEFAULT_CONFIG, ...config };
      console.log('已加载分发配置:', cachedConfig);
      return cachedConfig;
    }
  } catch (error) {
    console.log('未找到分发配置文件，使用默认配置');
  }
  
  // 默认为高级版本配置
  cachedConfig = DEFAULT_CONFIG;
  return cachedConfig;
};

export const getDistributionConfig = (): DistributionConfig => {
  return cachedConfig || DEFAULT_CONFIG;
};

export const isFeatureEnabled = (feature: string): boolean => {
  const config = getDistributionConfig();
  return config.features.includes(feature);
};

export const shouldShowUpgradePrompts = (): boolean => {
  const config = getDistributionConfig();
  return config.showUpgradePrompts;
};

export const getAppMetadata = () => {
  const config = getDistributionConfig();
  return {
    name: config.appName,
    version: config.version,
    buildType: config.buildType,
  };
};