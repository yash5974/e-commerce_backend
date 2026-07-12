import { Schema, model, Document } from "mongoose";
import { BaseDocument, ObjectId } from "./base.types.js";

export interface IReview extends BaseDocument, Document {
  userId: ObjectId;
  productId: ObjectId;
  rating: number;
  comment: string;
}

const reviewSchema = new Schema<IReview>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// INDEXES
reviewSchema.index({ productId: 1, createdAt: -1 });
reviewSchema.index({ userId: 1, productId: 1 }, { unique: true });

export const ReviewModel = model<IReview>("Review", reviewSchema);
