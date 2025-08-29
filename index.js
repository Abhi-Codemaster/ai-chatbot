import dotenv from "dotenv";
import Groq from "groq-sdk";
import { getUserDetails, calculateAUM, getTransactionDetails } from "./controllers/aiController.js";
import connectToMongoDB from "./services/conn_mongo.js";
import readlineSync from "readline-sync";
import { calculateAge } from "./common/common.js";

dotenv.config();

const MODEL = process.env.GROQ_MODEL || "llama3-8b-8192";
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// System prompt for determining query type
const CLASSIFIER_PROMPT = `
You are a query classifier. Analyze the user's question and determine:

1. USER_QUERY → Questions about finding user details, client information, or database searches.
   - Examples: "Find user with PAN ABGPA5303H", "Get details of Abhishek", "Search client by mobile"

2. GENERAL_QUERY_SHORT → General knowledge questions where the answer is short, factual, or one-line.
   - Examples: "What is India's prime minister name?", "Who is Elon Musk?", "What is 2+2?"

3. GENERAL_QUERY_LONG → General knowledge questions where the answer requires explanation or detail.
   - Examples: "What is SIP?", "Explain mutual funds", "How does stock market work?"

Respond with ONLY one of these labels: "USER_QUERY", "GENERAL_QUERY_SHORT", or "GENERAL_QUERY_LONG"

User question: "{query}"
`;

// System prompt for function-based user queries
const USER_SYSTEM_PROMPT = `
You are an AI assistant specialized in user database queries. Follow this process:

1. PLAN the solution using available tools.
2. Take ACTION with the appropriate tool.
3. Provide OUTPUT based on observations.

Available tools:
1. getUserDetails(params: object): object
2. calculateAUM(params: object): object
3. getTransactionDetails(params: object): object

Parameters accepted for getUserDetails:
- clientId: string (client ID)
- PAN: string (PAN number)  
- name: string (user name)
- mobile: string (mobile number)

Parameters accepted for calculateAUM:
- clientId: string (to calculate AUM for a specific client)
- arn_id: number (to calculate AUM for an ARN/distributor)
- agentCode: string (to calculate AUM by agent code)
- data_type: string (e.g., "CAMS", "KARVY" to filter by type)

Parameters accepted for getTransactionDetails:
- clientId: string (client ID) [Required]
- limit: number (number of transactions to fetch, default 10)
- transactionType: string (e.g., "Purchase", "Redemption")
- dateFrom: string (YYYY-MM-DD)
- dateTo: string (YYYY-MM-DD)

Format your response as:
PLAN { "type": "plan", "plan": "description of what you'll do" }
ACTION { "type": "action", "function": "functionName", "input": {"parameter": "value"} }

Example 1:
User: "Calculate AUM for client ID 11181"
PLAN { "type": "plan", "plan": "I will calculate AUM for the given client ID" }
ACTION { "type": "action", "function": "calculateAUM", "input": {"clientId": "11181"} }

Example 2:
User: "Get last 20 transactions of client 11181"
PLAN { "type": "plan", "plan": "I will fetch the last 20 transactions for the client" }
ACTION { "type": "action", "function": "getTransactionDetails", "input": {"clientId": "11181", "limit": 20} }
`;

// System prompt for general queries
const GENERAL_SYSTEM_PROMPT = `
You are a helpful AI assistant that can answer general questions about finance, investments, business, technology, and other topics. 

Provide clear, accurate, and helpful explanations. When explaining financial terms or concepts:
- Give practical examples
- Use simple language
- Mention both benefits and risks where applicable
- Provide actionable insights when relevant

Be conversational and helpful. If you're not sure about something, acknowledge it.
`;

const classifyQuery = async (query) => {
  try {
    const prompt = CLASSIFIER_PROMPT.replace("{query}", query);
    
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 10,
    });
    
    const classification = response.choices[0]?.message?.content?.trim();
    console.log("🤖 Query classified as:", classification);
    return classification;
  } catch (error) {
    console.error("Error classifying query:", error);
    return "GENERAL_QUERY"; // Default to general query if classification fails
  }
};

const parseAction = (message) => {
  try {
    console.log("Parsing action from message...");
    
    // Look for ACTION block in the message
    const actionMatch = message.match(/ACTION\s*\{[^}]*"function":\s*"([^"]+)"[^}]*"input":\s*(\{[^}]*\}|\[[^\]]*\]|"[^"]*")[^}]*\}/);
    
    if (!actionMatch) {
      console.log("No ACTION block found in message");
      return null;
    }

    const functionName = actionMatch[1];
    let inputStr = actionMatch[2];
    
    console.log("Function name:", functionName);
    console.log("Input string:", inputStr);

    let inputParams = {};
    
    try {
      // Try to parse as JSON first
      if (inputStr.startsWith('{') || inputStr.startsWith('[')) {
        inputParams = JSON.parse(inputStr);
      } else {
        // If it's a simple string, try to extract parameter information
        inputStr = inputStr.replace(/"/g, '').trim();
        
        // Auto-detect parameter type
        if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(inputStr)) {
          inputParams = { PAN: inputStr };
        } else if (/^\d{10}$/.test(inputStr)) {
          inputParams = { mobile: inputStr };
        } else if (/^[A-Z0-9]+$/.test(inputStr) && inputStr.length > 3) {
          inputParams = { clientId: inputStr };
        } else {
          inputParams = { name: inputStr };
        }
      }
    } catch (parseError) {
      console.error("Error parsing input parameters:", parseError);
      return null;
    }

    console.log("Parsed parameters:", inputParams);
    return { functionName, input: inputParams };
    
  } catch (err) {
    console.error("Error parsing action:", err);
    return null;
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


const sendMessage = async (messages, systemPrompt) => {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages
    ],
    temperature: 0.7,
  });
  return response.choices[0]?.message?.content?.trim();
};

const handleUserQuery = async (userPrompt) => {
  console.log("🔍 Processing user database query...");
  
  const messages = [
    { role: "user", content: userPrompt },
  ];

  try {
    const planningResponse = await sendMessage(messages, USER_SYSTEM_PROMPT);
    console.log("🧠 AI Planning Response:\n", planningResponse);

    const action = parseAction(planningResponse);
    if (!action) {
      console.log("❌ No valid ACTION step found. Treating as general query.");
      return await handleGeneralQuery(userPrompt);
    }

    console.log("🔧 Executing function:", action.functionName);
    console.log("📥 With parameters:", action.input);

    const finalOutput = await callFunction(action.functionName, action.input);
    console.log(finalOutput);

  } catch (error) {
    console.error("❌ User Query Error:", error.message);
    console.log("💡 Falling back to general query handling...");
    await handleGeneralQuery(userPrompt);
  }
};

const handleGeneralQuery = async (userPrompt, mode = "long") => {
  console.log("💭 Processing general knowledge query...");

  let systemPrompt = GENERAL_SYSTEM_PROMPT;
  if (mode === "short") {
    systemPrompt += `Answer as concisely as possible (1–2 sentences, direct fact).`;
  } else {
    systemPrompt += `Provide a detailed explanation (3–5 paragraphs if needed).`;
  }

  const messages = [{ role: "user", content: userPrompt }];

  try {
    const response = await sendMessage(messages, systemPrompt);
    console.log("🤖 AI Response:\n");
    console.log("=" + "=".repeat(50));
    console.log(response);
    console.log("=" + "=".repeat(50));
  } catch (error) {
    console.error("❌ General Query Error:", error.message);
    console.log("Sorry, I couldn't process your question right now. Please try again.");
  }
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

  // Classify the query first
  const queryType = await classifyQuery(userPrompt);

  if (queryType === "USER_QUERY") {
    await handleUserQuery(userPrompt);
  } else if (queryType === "GENERAL_QUERY_SHORT") {
    await handleGeneralQuery(userPrompt, "short");
  } else {
    await handleGeneralQuery(userPrompt, "long");
  }
};

const getUserInput = () => {
  console.log("\n💬 Ask me anything! I can help with:");
  console.log("   🔍 User Database Queries:");
  console.log("      • 'Find user with PAN ABGPA5303H'");
  console.log("      • 'Get details of user named John'");
  console.log("      • 'Search user with mobile 9827095272'");
  console.log("      'get last 10 transaction clientId 102122'")
  console.log("   🧠 General Questions:");
  console.log("      • 'What is SIP?'");
  console.log("      • 'Explain mutual funds'");
  console.log("      • 'How does stock market work?'");
  console.log("   📝 Type 'exit' or 'quit' to close\n");
  
  const userPrompt = readlineSync.question(">> ");
  return userPrompt.trim();
};

const main = async () => {  
  try {
    // Connect to MongoDB
    await connectToMongoDB();

    while (true) {
      try {
        const userPrompt = getUserInput();
        
        if (userPrompt.toLowerCase() === 'exit' || userPrompt.toLowerCase() === 'quit') {
          console.log("👋 Thank you for using the AI Chatbot! Goodbye!");
          process.exit(0);
        }
        
        if (userPrompt.trim() === '') {
          console.log("⚠️  Please enter a valid question.");
          continue;
        }

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

// Start the application
main().catch(console.error);