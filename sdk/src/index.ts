import * as crypto from "crypto";

export interface GroupDealConfig {
  baseUrl: string;
  webhookSecret?: string;
  apiKey?: string;
}

export class GroupDealSDK {
  private baseUrl: string;
  private webhookSecret?: string;
  private apiKey?: string;

  constructor(config: GroupDealConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.webhookSecret = config.webhookSecret;
    this.apiKey = config.apiKey;
  }

  /**
   * Verify an incoming webhook signature from GroupDeal.
   * Returns true if signature is valid and timestamp is within tolerance (5 minutes).
   */
  public verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    timestampHeader: string,
    toleranceSeconds = 300
  ): boolean {
    if (!this.webhookSecret) {
      throw new Error("Webhook secret not configured in SDK");
    }

    const timestamp = parseInt(timestampHeader, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      return false; // Replay attack detected
    }

    const message = `${timestamp}.${rawBody}`;
    const expectedSig = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(message)
      .digest("hex");

    const providedSig = signatureHeader.replace(/^sha256=/, "");
    return crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(providedSig));
  }

  /**
   * Fetch public campaign details
   */
  public async getCampaign(campaignId: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/campaigns/${campaignId}`);
    if (!res.ok) throw new Error(`Failed to fetch campaign: ${res.statusText}`);
    return await res.json();
  }

  /**
   * Fetch all active campaigns
   */
  public async listCampaigns() {
    const res = await fetch(`${this.baseUrl}/api/v1/campaigns`);
    if (!res.ok) throw new Error(`Failed to list campaigns: ${res.statusText}`);
    return await res.json();
  }

  /**
   * Fulfill an order with encrypted digital license key
   */
  public async fulfillOrder(token: string, orderId: string, secretContent: string) {
    const res = await fetch(`${this.baseUrl}/api/seller/orders/${orderId}/deliver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ secretContent }),
    });
    if (!res.ok) throw new Error(`Failed to fulfill order: ${res.statusText}`);
    return await res.json();
  }
}
