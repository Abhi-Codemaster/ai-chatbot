import mongoose from "mongoose";

const connectToMongoDB = async () => {
  try {
    const mongoURI = process.env.DB_CONNECTION_STRING || "mongodb://localhost:27017/ai_agent_db";
    await mongoose.connect(mongoURI);
    console.log("Connected to MongoDB");
  }
  catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

export default connectToMongoDB;