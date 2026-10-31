import { env } from '../../config/env';
import { PaymentProvider } from './provider.interface';
import { simulatedProvider } from './simulated.provider';
import { chapaProvider } from './chapa';

export class ProviderRegistry {
  private providers = new Map<string, PaymentProvider>();

  constructor() {
    // Register built-in providers
    this.register(chapaProvider);
    this.register(simulatedProvider);
  }

  register(provider: PaymentProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  get(name: string): PaymentProvider | undefined {
    const normalized = name.trim().toLowerCase();
    if (!this.isEnabled(normalized)) {
      return undefined;
    }
    return this.providers.get(normalized);
  }

  getEnabledNames(): string[] {
    const list = (env.PAYMENT_PROVIDERS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    // Simulated provider is only available when DEMO_MODE=true
    return list.filter((name) => {
      if (name === 'simulated' && !env.DEMO_MODE) {
        return false;
      }
      return true;
    });
  }

  isEnabled(name: string): boolean {
    return this.getEnabledNames().includes(name.trim().toLowerCase());
  }

  getDefault(): PaymentProvider {
    const enabled = this.getEnabledNames();
    if (enabled.length === 0) {
      throw new Error('No payment providers enabled in PAYMENT_PROVIDERS');
    }
    const defaultName = enabled[0];
    const provider = this.get(defaultName);
    if (!provider) {
      throw new Error(`Default payment provider "${defaultName}" is not registered`);
    }
    return provider;
  }
}

export const paymentRegistry = new ProviderRegistry();
