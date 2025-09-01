import dotenv from "dotenv";
import Groq from "groq-sdk";
import express from 'express';
import cors from 'cors';
import { getUserDetails, calculateAUM, getTransactionDetails } from "./controllers/aiController.js";
import connectToMongoDB from "./services/conn_mongo.js";
import readlineSync from "readline-sync";
import { calculateAge } from "./common/common.js";
import {UNIFIED_SYSTEM_PROMPT} from "./prompts/systemPrompts.js";
import {getCachedResponse,setCachedResponse,clearResponseCache} from "./helpers/chatData.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

//connect to MongoDB
await connectToMongoDB();

clearResponseCache();

app.use(cors());
app.use(express.json());

const MODEL = process.env.GROQ_MODEL;
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const processQuery = async (userPrompt) => {
  try {
    // Check cache first
    const cachedResponse = getCachedResponse(userPrompt);
    console.log("check tt=>", cachedResponse);
    if (cachedResponse) {
      console.log("📋 Using cached response");
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
    setCachedResponse(userPrompt, content);
    return content;
  } catch (error) {
    console.error("❌ API Error:", error.message);
    throw error;
  }
};


// Parse and execute the AI response
// const handleAIResponse = async (aiResponse, userPrompt) => {
//   try {
//     const parsedResponse = JSON.parse(aiResponse);
    
//     if (parsedResponse.type === "database_query") {
//       console.log("🔧 Executing:", parsedResponse.explanation);
//       console.log("🎯 Function:", parsedResponse.function);
//       console.log("📥 Parameters:", parsedResponse.parameters);
      
//       const result = await callFunction(parsedResponse.function, parsedResponse.parameters);
//       return result;
      
//     } else if (parsedResponse.type === "general_response") {
//       return parsedResponse.answer;
//     }
    
//   } catch (parseError) {
//     console.log("⚠️  Received non-JSON response, treating as general answer:");
//     console.log("=" + "=".repeat(50));
//     console.log(aiResponse);
//     console.log("=" + "=".repeat(50));
//   }
// };

const handleAIResponse = async (aiResponse, userPrompt) => {
  try {
    // Extract JSON substring inside aiResponse
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // No JSON found, return full aiResponse as fallback
      return aiResponse;
    }
    
    const jsonStr = jsonMatch[0];
    const parsedResponse = JSON.parse(jsonStr);
    
    if (parsedResponse.type === "database_query") {
      console.log("🔧 Executing:", parsedResponse.explanation);
      console.log("🎯 Function:", parsedResponse.function);
      console.log("📥 Parameters:", parsedResponse.parameters);
      
      const result = await callFunction(parsedResponse.function, parsedResponse.parameters);
      return result;
      
    } else if (parsedResponse.type === "general_response") {
      return parsedResponse.answer;
    } else {
      // If type is unknown, return whole answer field or fallback
      return parsedResponse.answer || aiResponse;
    }
    
  } catch (parseError) {
    console.log("⚠️  Received non-JSON response, treating as general answer:");
    console.log("=" + "=".repeat(50));
    console.log(aiResponse);
    console.log("=" + "=".repeat(50));
    return aiResponse;  // Return the raw response as fallback
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

  let output = `📑 Transactions for Client ${observation.clientId}:\n`;

  observation.transactions.forEach((t, i) => {
    output += `\n#${i + 1} 🏦 ${t.fundDesc || "Unknown Fund"}\n`;
    output += `📅 ${t.transDate || "N/A"} | 💰 ₹${t.amt || "N/A"} | 🔹 ${t.appTransDesc || t.appTransType || "N/A"}\n`;
    output += `📄 ${t.folioNumber || "N/A"} | 🔢 ${t.unit || "N/A"} | 📈 ${t.nav || "N/A"} | 📊 ${t.transStatus || "N/A"}\n`;
    output += `───────────────\n`;
  });

  return output;
};

// const formatTransactionDetails = (observation) => {
//   if (!observation || observation.message) {
//     return {
//       text: `ℹ️ ${observation?.message || "No transaction data found."}`,
//       html: `<p>ℹ️ ${observation?.message || "No transaction data found."}</p>`
//     };
//   }

//   let textOutput = `📑 Transactions for Client ${observation.clientId}:\n`;
//   let htmlOutput = `<h3>📑 Transactions for Client ${observation.clientId}:</h3>`;

//   observation.transactions.forEach((t, i) => {
//     // Text (with \n newlines)
//     textOutput += `\n#${i + 1} 🏦 ${t.fundDesc || "Unknown Fund"}\n`;
//     textOutput += `📅 ${t.transDate || "N/A"} | 💰 ₹${t.amt || "N/A"} | 🔹 ${t.appTransDesc || t.appTransType || "N/A"}\n`;
//     textOutput += `📄 ${t.folioNumber || "N/A"} | 🔢 ${t.unit || "N/A"} | 📈 ${t.nav || "N/A"} | 📊 ${t.transStatus || "N/A"}\n`;
//     textOutput += `───────────────\n`;

//     // HTML (with <br> line breaks)
//     htmlOutput += `<div style="margin-bottom:10px;">
//       <strong>#${i + 1}</strong> 🏦 ${t.fundDesc || "Unknown Fund"}<br>
//       📅 ${t.transDate || "N/A"} | 💰 ₹${t.amt || "N/A"} | 🔹 ${t.appTransDesc || t.appTransType || "N/A"}<br>
//       📄 ${t.folioNumber || "N/A"} | 🔢 ${t.unit || "N/A"} | 📈 ${t.nav || "N/A"} | 📊 ${t.transStatus || "N/A"}<br>
//       <hr>
//     </div>`;
//   });

//   // return { text: textOutput, html: htmlOutput };
//   return htmlOutput;
// };



const chat = async (userPrompt) => {
  console.log(`\n🟢 User: ${userPrompt}`);
  
  try {
    // Single API call to process everything
    const aiResponse = await processQuery(userPrompt);
    return await handleAIResponse(aiResponse, userPrompt);
    
  } catch (error) {
    console.error("❌ Error processing request:", error.message);
    console.log("💡 Please try again with a different question.");
  }
};


app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Message is required and must be a non-empty string'
      });
    }

    console.log(`\n🟢 User: ${message}`);

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simple keyword matching for demo
    let lowerMessage = message.toLowerCase().trim();
    const response = await chat(lowerMessage);

    res.json({
      response: response,
      timestamp: new Date().toISOString(),
      processed: true
    });

  } catch (error) {
    console.error('❌ Chat API Error:', error.message);
    
    res.status(500).json({
      error: 'I apologize, but I encountered an error while processing your request. Please try again.',
      timestamp: new Date().toISOString()
    });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 AI Chatbot API Server started successfully!`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🔗 API Endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`\n📋 Available Test Queries:`);
  console.log(`   • "Find user with PAN ABGPA5303H"`);
  console.log(`   • "What is SIP?"`);
  console.log(`   • "Calculate AUM for client 11181"`);
  console.log(`   • "Explain mutual funds"`);
  console.log(`   • "Get transaction history"`);
  console.log(`\n✨ Ready to accept requests!\n`);
});