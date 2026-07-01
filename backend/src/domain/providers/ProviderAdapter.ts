export interface ProviderAdapter {
  id: string;
  submit(prompt: string): Promise<{ providerJobId: string }>;
  poll(providerJobId: string): Promise<{ status: string }>;
}
