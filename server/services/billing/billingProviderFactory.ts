import { IBillingProvider } from './billingProvider.interface.js';
import { StripeBillingProvider } from './stripeProvider.js';
import { UnconfiguredBillingProvider } from './unconfiguredProvider.js';

export class BillingProviderFactory {
  static getProvider(): IBillingProvider {
    const stripe = new StripeBillingProvider();
    if (stripe.isConfigured()) {
      return stripe;
    }
    return new UnconfiguredBillingProvider();
  }
}
