import { Schema, model, Document } from "mongoose";
import { BaseDocument, ObjectId } from "./base.types.js";

export interface ICartItem {
  productId: ObjectId;
  quantity: number;
}

export interface ICart extends BaseDocument, Document {
  userId: ObjectId;
  items: ICartItem[];
  updatedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const cartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [cartItemSchema], default: [] },
    updatedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// INDEX
cartSchema.index({ userId: 1 });

export const CartModel = model<ICart>("Cart", cartSchema);
