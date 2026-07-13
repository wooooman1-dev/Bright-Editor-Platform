import type { ContentDocument } from "../content";

export type PublicationStatus = "draft" | "prepared" | "scheduled" | "published" | "failed";
export type PublicationRequest = Readonly<{
  content: ContentDocument;
  platform: string;
  scheduledFor?: string;
}>;
export type PreparedPublication = Readonly<{
  payload: unknown;
  platform: string;
  request: PublicationRequest;
}>;
export type PublicationResult = Readonly<{
  externalId?: string;
  status: PublicationStatus;
}>;

export interface PublishingAdapter {
  readonly platform: string;
  prepare(request: PublicationRequest): Promise<PreparedPublication>;
  publish(publication: PreparedPublication): Promise<PublicationResult>;
}

export class PublishingAdapterRegistry {
  private readonly adapters = new Map<string, PublishingAdapter>();
  register(adapter: PublishingAdapter): void { this.adapters.set(adapter.platform, adapter); }
  get(platform: string): PublishingAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) throw new Error(`No publishing adapter registered for ${platform}.`);
    return adapter;
  }
}

export class PublishingPipeline {
  constructor(private readonly adapters: PublishingAdapterRegistry) {}
  async prepare(request: PublicationRequest): Promise<PreparedPublication> {
    validateSchedule(request.scheduledFor);
    return this.adapters.get(request.platform).prepare(request);
  }
  async publish(request: PublicationRequest): Promise<PublicationResult> {
    const adapter = this.adapters.get(request.platform);
    return adapter.publish(await this.prepare(request));
  }
}

function validateSchedule(value?: string): void {
  if (value && Number.isNaN(Date.parse(value))) throw new Error("Schedule must be a valid date.");
}
