export interface PaymentProviderAdapter {
  name: string;
  charge(amount: number, currency: string, metadata?: Record<string, unknown>): Promise<{ success: boolean; reference?: string; error?: string }>;
  refund(amount: number, currency: string, reference?: string): Promise<{ success: boolean; error?: string }>;
}

export class PaymentProviderAdapterRegistry {
  private adapters = new Map<string, PaymentProviderAdapter>();

  register(adapter: PaymentProviderAdapter) {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string) {
    return this.adapters.get(name);
  }
}

export const paymentProviderRegistry = new PaymentProviderAdapterRegistry();
