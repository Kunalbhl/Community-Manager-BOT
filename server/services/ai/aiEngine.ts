import { AIProvider } from './aiProvider.interface.js';
import { GeminiAIProvider } from './geminiProvider.js';
import { logger } from '../../logging/logger.js';

export class AIEngineManager {
  private providers: Map<string, AIProvider> = new Map();
  private activeProviderName: string = 'Community Brain Engine';

  constructor() {
    // Register standard default provider
    const defaultProvider = new GeminiAIProvider();
    this.registerProvider(defaultProvider);
    this.activeProviderName = defaultProvider.providerName;
  }

  registerProvider(provider: AIProvider): void {
    this.providers.set(provider.providerName, provider);
    logger.info(`[AIEngine] Registered AI provider: ${provider.providerName}`);
  }

  setActiveProvider(providerName: string): boolean {
    if (this.providers.has(providerName)) {
      this.activeProviderName = providerName;
      logger.info(`[AIEngine] Switched active AI provider to: ${providerName}`);
      return true;
    }
    return false;
  }

  getActiveProvider(): AIProvider | null {
    return this.providers.get(this.activeProviderName) || null;
  }

  isConfigured(): boolean {
    const provider = this.getActiveProvider();
    return provider ? provider.isConfigured() : false;
  }
}

export const AIEngine = new AIEngineManager();
