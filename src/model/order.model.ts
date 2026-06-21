import { Schema, model, Document } from "mongoose";
import { BaseDocument, ObjectId } from "./base.types";

export enum OrderStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  FAILED = "FAILED",
  SHIPPED = "SHIPPED",
}

export interface IOrderItem {
  productId: ObjectId;
  name: string;
  price: number;
  quantity: number;
}

export interface IOrder extends BaseDocument, Document {
  userId: ObjectId;
  status: OrderStatus;
  totalAmount: number;
  paymentId?: ObjectId;
  items: IOrderItem[];
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: Object.values(OrderStatus), required: true },
    totalAmount: { type: Number, required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    items: { type: [orderItemSchema], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// INDEXES
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

export const OrderModel = model<IOrder>("Order", orderSchema);
