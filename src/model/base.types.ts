import { Types } from "mongoose";

export type ObjectId = Types.ObjectId;

export interface BaseDocument {
  _id: ObjectId;
  createdAt: Date;
}

export interface SoftDelete {
  isActive: boolean;
}
