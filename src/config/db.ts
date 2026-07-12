import mongoose from "mongoose";
import { environment } from "./env.js";

export const connectDB = async () => {
  try {
    await mongoose.connect(environment.DB_CONNECTION, {
      autoIndex: true,
      maxPoolSize: 10,
    });

    console.log("✅ Database connected successfully!");
  } catch (error) {
    console.log("MongoDB Connection Failed");
    process.exit(1);
  }
};
