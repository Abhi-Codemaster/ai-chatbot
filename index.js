import dotenv from "dotenv";
import Groq from "groq-sdk";
import { getUserDetails, calculateAUM, getTransactionDetails } from "./controllers/aiController.js";
import connectToMongoDB from "./services/conn_mongo.js";
import readlineSync from "readline-sync";
import { calculateAge } from "./common/common.js";

dotenv.config();

const MODEL = process.env.GROQ_MODEL || "llama3-8b-8192";
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Cache for storing recent responses to avoid duplicate API calls
const responseCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Single unified system prompt that handles everything
const UNIFIED_SYSTEM_PROMPT = `
  You are an intelligent AI assistant that can handle both database queries and general knowledge questions.

  **AVAILABLE TOOLS:**
  1. getUserDetails(params) - Search user database
    Parameters: clientId, PAN, name, mobile
  2. calculateAUM(params) - Calculate Assets Under Management  
    Parameters: clientId, arn_id, agentCode
  3. getTransactionDetails(params) - Get transaction history
    Parameters: clientId (required), limit, transactionType, dateFrom, dateTo

  **RESPONSE FORMAT:**
  For database queries, respond with JSON:
  {
    "type": "database_query",
    "function": "functionName",
    "parameters": {...},
    "explanation": "Brief explanation of what you're doing"
  }

  For general questions, respond with JSON:
  {
    "type": "general_response", 
    "answer": "Your complete answer here",
    "mode": "short" | "detailed"
  }

  **EXAMPLES:**

  User: "Find user with PAN ABGPA5303H"
  Response: {"type": "database_query", "function": "getUserDetails", "parameters": {"PAN": "ABGPA5303H"}, "explanation": "Searching for user with the provided PAN number"}

  User: "What is SIP?"
  Response: {"type": "general_response", "answer": "SIP (Systematic Investment Plan) is a method of investing in mutual funds where you invest a fixed amount at regular intervals (monthly/quarterly). It helps in rupee cost averaging and disciplined investing.", "mode": "detailed"}

  User: "Who is the PM of India?"
  Response: {"type": "general_response", "answer": "Narendra Modi is the current Prime Minister of India.", "mode": "short"}

  User: "Get last 5 transactions for client 11181"
  Response: {"type": "database_query", "function": "getTransactionDetails", "parameters": {"clientId": "11181", "limit": 5}, "explanation": "Fetching the last 5 transactions for the specified client"}

  Always respond with valid JSON only.
  `;

// Function to generate cache key
const getCacheKey = (query) => {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
};

// Check cache before making API call
const getCachedResponse = (query) => {
  const key = getCacheKey(query);
  const cached = responseCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log("📋 Using cached response");
    return cached.response;
  }
  
  return null;
};

// Store response in cache
const setCachedResponse = (query, response) => {
  const key = getCacheKey(query);
  responseCache.set(key, {
    response,
    timestamp: Date.now()
  });
  
  // Clean up old cache entries
  if (responseCache.size > 100) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
};

// Single API call to handle everything
const processQuery = async (userPrompt) => {
  try {
    // Check cache first
    const cachedResponse = getCachedResponse(userPrompt);
    if (cachedResponse) {
      return cachedResponse;
    }

    console.log("🔄 Making API call...");
    
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: UNIFIED_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content?.trim();
    
    // Cache the response
    setCachedResponse(userPrompt, content);
    
    return content;
  } catch (error) {
    console.error("❌ API Error:", error.message);
    throw error;
  }
};

// Parse and execute the AI response
const handleAIResponse = async (aiResponse, userPrompt) => {
  try {
    const parsedResponse = JSON.parse(aiResponse);
    
    if (parsedResponse.type === "database_query") {
      console.log("🔧 Executing:", parsedResponse.explanation);
      console.log("🎯 Function:", parsedResponse.function);
      console.log("📥 Parameters:", parsedResponse.parameters);
      
      const result = await callFunction(parsedResponse.function, parsedResponse.parameters);
      console.log(result);
      
    } else if (parsedResponse.type === "general_response") {
      console.log("🤖 AI Response:\n");
      console.log("=" + "=".repeat(50));
      console.log(parsedResponse.answer);
      console.log("=" + "=".repeat(50));
    }
    
  } catch (parseError) {
    console.log("⚠️  Received non-JSON response, treating as general answer:");
    console.log("=" + "=".repeat(50));
    console.log(aiResponse);
    console.log("=" + "=".repeat(50));
  }
};

const callFunction = async (functionName, input) => {
  switch (functionName) {
    case "getUserDetails":
      return formatUserDetails(await getUserDetails(input));
    case "calculateAUM":
      return formatAUMDetails(await calculateAUM(input));
    case "getTransactionDetails":
      return formatTransactionDetails(await getTransactionDetails(input));
    default:
      throw new Error(`Unsupported function: ${functionName}`);
  }
};

// Enhanced parameter detection for better accuracy
const detectParameters = (query) => {
  const patterns = {
    PAN: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
    mobile: /\b\d{10}\b/g,
    clientId: /\b(?:client\s*(?:id|ID)\s*)?([A-Z0-9]{4,})\b/gi,
    limit: /\b(?:last|first)\s*(\d+)\b/gi,
    transactionType: /\b(purchase|redemption|dividend|switch)\b/gi
  };

  const detected = {};
  
  for (const [type, pattern] of Object.entries(patterns)) {
    const matches = query.match(pattern);
    if (matches) {
      if (type === 'limit') {
        detected[type] = parseInt(matches[0].match(/\d+/)[0]);
      } else if (type === 'clientId') {
        detected[type] = matches[0].replace(/client\s*(?:id|ID)\s*/gi, '').trim();
      } else {
        detected[type] = matches[0];
      }
    }
  }
  
  return detected;
};

const formatUserDetails = (observation) => {
  if (!observation || Object.keys(observation).length === 0) {
    return "❌ Sorry, no user details were found.";
  }

  if (observation.message) {
    return `ℹ️  ${observation.message}`;
  }

  const { name, DOB, city, pan, mobile, email, address } = observation;

  if (!name) {
    return "❌ Sorry, no user details were found.";
  }

  const age = DOB ? calculateAge(DOB) : "N/A";

  let formattedResponse = `✅ User Details Found:\n\n`;
  formattedResponse += `👤 ${name}`;
  if (age !== "N/A") formattedResponse += ` (${age} years old)`;
  if (city) formattedResponse += ` from ${city}`;
  formattedResponse += `\n\n📋 Complete Information:\n`;

  if (DOB) formattedResponse += `📅 Date of Birth: ${DOB}\n`;
  if (address) formattedResponse += `🏠 Address: ${address}\n`;
  if (city) formattedResponse += `🌆 City: ${city}\n`;
  if (pan) formattedResponse += `🆔 PAN: ${pan}\n`;
  if (mobile) formattedResponse += `📱 Mobile: ${mobile}\n`;
  if (email) formattedResponse += `📧 Email: ${email}\n`;

  return formattedResponse;
};

const formatAUMDetails = (observation) => {
  if (!observation || observation.message) {
    return `ℹ️ ${observation?.message || "No AUM data found."}`;
  }

  return `💰 Total AUM: ₹${observation.totalAUM.toFixed(2)} (across ${observation.count} records)`;
};

const formatTransactionDetails = (observation) => {
  if (!observation || observation.message) {
    return `ℹ️ ${observation?.message || "No transaction data found."}`;
  }

  let output = `📑 Transactions for Client ${observation.clientId}:\n\n`;
  observation.transactions.forEach((t, i) => {
    output += `#${i + 1} 🏦 ${t.fundDesc || "Unknown Fund"}\n`;
    output += `   📅 Date: ${t.transDate || "N/A"} | 💰 Amount: ₹${t.amt || "N/A"}\n`;
    output += `   🔹 Type: ${t.appTransDesc || t.appTransType || "N/A"} | Status: ${t.transStatus || "N/A"}\n`;
    output += `   📄 Folio: ${t.folioNumber || "N/A"} | Units: ${t.unit || "N/A"} | NAV: ${t.nav || "N/A"}\n\n`;
  });

  return output;
};

const chat = async (userPrompt) => {
  console.log(`\n🟢 User: ${userPrompt}`);
  
  try {
    // Single API call to process everything
    const aiResponse = await processQuery(userPrompt);
    await handleAIResponse(aiResponse, userPrompt);
    
  } catch (error) {
    console.error("❌ Error processing request:", error.message);
    console.log("💡 Please try again with a different question.");
  }
};

const getUserInput = () => {
  console.log("\n💬 Ask me anything! I can help with:");
  console.log("   🔍 User Database Queries:");
  console.log("      • 'Find user with PAN ABGPA5303H'");
  console.log("      • 'Get details of user named John'");
  console.log("      • 'Search user with mobile 9827095272'");
  console.log("      • 'Get last 10 transactions for client 102122'");
  console.log("      • 'Calculate AUM for client 11181'");
  console.log("   🧠 General Questions:");
  console.log("      • 'What is SIP?'");
  console.log("      • 'Explain mutual funds'");
  console.log("      • 'How does stock market work?'");
  console.log("   📝 Type 'exit' or 'quit' to close\n");

  const userPrompt = readlineSync.question(">> ");
  return userPrompt.trim();
};

// Batch processing for multiple queries (optional enhancement)
const processBatchQueries = async (queries) => {
  console.log(`🔄 Processing ${queries.length} queries in batch...`);
  
  const promises = queries.map(query => processQuery(query));
  const responses = await Promise.all(promises);
  
  return responses;
};

// Add connection pooling and error recovery
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

const connectWithRetry = async () => {
  while (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
    try {
      await connectToMongoDB();
      console.log("✅ Connected to MongoDB");
      return;
    } catch (error) {
      connectionAttempts++;
      console.log(`⚠️  Connection attempt ${connectionAttempts} failed: ${error.message}`);
      
      if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
        console.log(`🔄 Retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  throw new Error("Failed to connect to MongoDB after multiple attempts");
};

const main = async () => {
  try {
    // Connect to MongoDB with retry logic
    await connectWithRetry();
    
    // Clear cache on startup
    responseCache.clear();
    
    console.log("🚀 AI Chatbot started successfully!");
    console.log("💡 Optimizations enabled: Response caching, Single API calls");

    while (true) {
      try {
        const userPrompt = getUserInput();

        if (userPrompt.toLowerCase() === 'exit' || userPrompt.toLowerCase() === 'quit') {
          console.log("👋 Thank you for using the AI Chatbot! Goodbye!");
          console.log(`📊 Cache stats: ${responseCache.size} cached responses`);
          process.exit(0);
        }

        if (userPrompt.trim() === '') {
          console.log("⚠️  Please enter a valid question.");
          continue;
        }

        // Process with optimized single API call
        await chat(userPrompt);

        console.log("\n" + "─".repeat(60) + "\n");

      } catch (error) {
        console.error("❌ Error processing your request:", error.message);
        console.log("💡 Please try again with a different question.");
      }
    }
  } catch (error) {
    console.error("❌ Application Error:", error.message);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', () => {
  console.log("\n📊 Final cache stats:", responseCache.size, "cached responses");
  console.log("👋 Shutting down gracefully...");
  process.exit(0);
});

// Start the application
main().catch(console.error);