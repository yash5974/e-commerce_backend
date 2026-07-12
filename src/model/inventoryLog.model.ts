import { Schema, model, Document } from "mongoose";
import { BaseDocument, ObjectId } from "./base.types.js";

export enum InventoryLogType {
  ORDER = "ORDER",
  RESTOCK = "RESTOCK",
}

export interface IInventoryLog extends BaseDocument, Document {
  productId: ObjectId;
  type: InventoryLogType;
  quantity: number;
}

const inventoryLogSchema = new Schema<IInventoryLog>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    type: {
      type: String,
      enum: Object.values(InventoryLogType),
      required: true,
    },
    quantity: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

inventoryLogSchema.index({
  productId: 1,
  createdAt: -1,
});

export const InventoryLogModel = model<IInventoryLog>(
  "InventoryLog",
  inventoryLogSchema,
);
