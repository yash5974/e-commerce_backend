import { Document, Schema, model } from "mongoose";
import { BaseDocument, ObjectId, SoftDelete } from "./base.types.js";

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
productSchema.index({
  isActive: 1,
  categoryId: 1,
  createdAt: -1,
});
productSchema.index({
  isActive: 1,
  price: 1,
});
productSchema.index({
  isActive: 1,
  rating: -1,
});
productSchema.index({
  isActive: 1,
  brand: 1,
});
productSchema.index({
  name: "text",
  brand: "text",
  tags: "text",
});
productSchema.index({ slug: 1 }, { unique: true });

export const ProductModel = model<IProduct>("Product", productSchema);
