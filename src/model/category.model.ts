import { Schema, model, Document } from "mongoose";
import { BaseDocument } from "./base.types";

export interface ICategory extends BaseDocument, Document {
  name: string;
  slug: string;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// INDEX
categorySchema.index({ slug: 1 });

export const CategoryModel = model<ICategory>("Category", categorySchema);
