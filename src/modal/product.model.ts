import { Schema, model, Document } from "mongoose";
import { BaseDocument, SoftDelete, ObjectId } from "./base.types";

export interface IProduct extends BaseDocument, SoftDelete, Document {
  name: string;
  slug: string;
  description: string;
  categoryId: ObjectId;
  brand: string;
  price: number;
  discountPrice: number;
  stock: number;
  mainImage: string;
  galleryImages: string[];
  rating: number;
  reviewCount: number;
  tags: string[];
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, required: true },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    brand: { type: String, required: true },
    price: { type: Number, required: true },
    discountPrice: { type: Number, default: 0 },
    stock: { type: Number, required: true },
    mainImage: { type: String, required: true },
    galleryImages: { type: [String], default: [] },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// INDEXES (MANDATORY)
productSchema.index({ slug: 1 });
productSchema.index({ categoryId: 1, price: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ rating: -1 });

export const ProductModel = model<IProduct>("Product", productSchema);
