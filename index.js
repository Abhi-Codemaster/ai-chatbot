import dotenv from "dotenv";
import Groq from "groq-sdk";
import { getUserDetails } from "./controllers/aiController.js";
import connectToMongoDB from "./services/conn_mongo.js";
import readlineSync from "readline-sync";
import { calculateAge } from "./common/common.js";

dotenv.config();

const MODEL = process.env.GROQ_MODEL || "llama3-8b-8192";
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// System prompt for determining query type
const CLASSIFIER_PROMPT = `
You are a query classifier. Analyze the user's question and determine if it's:

1. USER_QUERY: Questions about finding user details, client information, or database searches
   - Examples: "Find user with PAN ABGPA5303H", "Get details of Abhishek", "Search client by mobile"

2. GENERAL_QUERY: General knowledge questions, explanations, or conversations
   - Examples: "What is SIP?", "Explain mutual funds", "How does stock market work?", "What is the weather?"

Respond with ONLY one word: either "USER_QUERY" or "GENERAL_QUERY"

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

Parameters accepted:
- clientId: string (client ID)
- PAN: string (PAN number)  
- name: string (user name)
- mobile: string (mobile number)

Format your response as:
PLAN { "type": "plan", "plan": "description of what you'll do" }
ACTION { "type": "action", "function": "getUserDetails", "input": {"parameter": "value"} }

Example:
User: "Find user with PAN ABGPA5303H"
PLAN { "type": "plan", "plan": "I will search for user using the PAN number" }
ACTION { "type": "action", "function": "getUserDetails", "input": {"PAN": "ABGPA5303H"} }
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
      return await getUserDetails(input);
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

    const observation = await callFunction(action.functionName, action.input);
    console.log("🔍 Database Result:", observation);

    const finalOutput = formatUserDetails(observation);
    console.log(finalOutput);

  } catch (error) {
    console.error("❌ User Query Error:", error.message);
    console.log("💡 Falling back to general query handling...");
    await handleGeneralQuery(userPrompt);
  }
};

const handleGeneralQuery = async (userPrompt) => {
  console.log("💭 Processing general knowledge query...");
  
  const messages = [
    { role: "user", content: userPrompt },
  ];

  try {
    const response = await sendMessage(messages, GENERAL_SYSTEM_PROMPT);
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

const chat = async (userPrompt) => {
  console.log(`\n🟢 User: ${userPrompt}`);

  // Classify the query first
  const queryType = await classifyQuery(userPrompt);

  if (queryType === "USER_QUERY") {
    await handleUserQuery(userPrompt);
  } else {
    await handleGeneralQuery(userPrompt);
  }
};

const getUserInput = () => {
  console.log("\n💬 Ask me anything! I can help with:");
  console.log("   🔍 User Database Queries:");
  console.log("      • 'Find user with PAN ABGPA5303H'");
  console.log("      • 'Get details of user named John'");
  console.log("      • 'Search user with mobile 9876543210'");
  console.log("   🧠 General Questions:");
  console.log("      • 'What is SIP?'");
  console.log("      • 'Explain mutual funds'");
  console.log("      • 'How does stock market work?'");
  console.log("   📝 Type 'exit' or 'quit' to close\n");
  
  const userPrompt = readlineSync.question(">> ");
  return userPrompt.trim();
};

const main = async () => {
  console.log("🚀 Starting Enhanced AI Chatbot...");
  console.log("🤖 I can handle both database queries and general questions!");
  
  try {
    // Connect to MongoDB
    console.log("🔄 Connecting to MongoDB...");
    await connectToMongoDB();
    console.log("✅ Connected to MongoDB successfully!");

    console.log("\n🎉 Chatbot is ready! Let's start...");

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