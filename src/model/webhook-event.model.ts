import { Document, Schema, model } from "mongoose";

import { BaseDocument } from "./base.types.js";

export enum WebhookProvider {
  STRIPE = "stripe",
  RAZORPAY = "razorpay",
}

export enum WebhookEventStatus {
  PROCESSING = "PROCESSING",
  PROCESSED = "PROCESSED",
}

export interface IWebhookEvent extends BaseDocument, Document {
  provider: WebhookProvider;
  eventId: string;
  eventType: string;
  status: WebhookEventStatus;
}

const webhookEventSchema = new Schema<IWebhookEvent>(
  {
    provider: {
      type: String,
      enum: Object.values(WebhookProvider),
      required: true,
    },

    eventId: {
      type: String,
      required: true,
    },

    eventType: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(WebhookEventStatus),
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

webhookEventSchema.index(
  {
    provider: 1,
    eventId: 1,
  },
  {
    unique: true,
  },
);

webhookEventSchema.index({
  provider: 1,
  createdAt: -1,
});

export const WebhookEventModel = model<IWebhookEvent>(
  "WebhookEvent",
  webhookEventSchema,
);
