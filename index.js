import dotenv from "dotenv";
import Groq from "groq-sdk";
import { getUserDetails } from "./controllers/aiController.js";
import connectToMongoDB from "./services/conn_mongo.js";
import readlineSync from "readline-sync";
import { calculateAge } from "./common/common.js";

dotenv.config();

const MODEL = process.env.GROQ_MODEL || "llama3-8b-8192";
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `
You are an AI assistant with START, PLAN, ACTION, OBSERVATION, and OUTPUT states. Follow this process:

1. Wait for user input.
2. PLAN the solution using available tools.
3. Take ACTION with the appropriate tool and capture OBSERVATION.
4. Produce the final OUTPUT based on the START prompt and observations.

Available tools:
1. User tool: getUserDetails(params: object): object

The getUserDetails function accepts parameters like:
- clientId: string (client ID)
- PAN: string (PAN number)
- name: string (user name)
- mobile: string (mobile number)

IMPORTANT: When using ACTION, format your input as a JSON object with the parameter names and values.

Example Interactions:
START { "type": "user", "user": "What are the details of user with PAN ABGPA5303H?" }
PLAN { "type": "plan", "plan": "I will call getUserDetails with the PAN number" }
ACTION { "type": "action", "function": "getUserDetails", "input": {"PAN": "ABGPA5303H"} }
OBSERVATION { "type": "observation", "observation": { name: "John Doe", age: "30", city: "Mumbai" } }
OUTPUT { "type": "output", "output": "John Doe is 30 years old and lives in Mumbai." }

START { "type": "user", "user": "Find user named Abhishek" }
PLAN { "type": "plan", "plan": "I will call getUserDetails with the name parameter" }
ACTION { "type": "action", "function": "getUserDetails", "input": {"name": "Abhishek"} }
OBSERVATION { "type": "observation", "observation": { name: "Abhishek Singh", age: "25", city: "Delhi" } }
OUTPUT { "type": "output", "output": "Abhishek Singh is 25 years old and lives in Delhi." }
`;

const parseAction = (message) => {
  try {
    console.log("Parsing action from message:", message);
    
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
        
        // Check if it looks like a PAN number
        if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(inputStr)) {
          inputParams = { PAN: inputStr };
        }
        // Check if it looks like a mobile number
        else if (/^\d{10}$/.test(inputStr)) {
          inputParams = { mobile: inputStr };
        }
        // Check if it looks like a client ID
        else if (/^[A-Z0-9]+$/.test(inputStr) && inputStr.length > 3) {
          inputParams = { clientId: inputStr };
        }
        // Otherwise treat as name
        else {
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

const sendMessage = async (messages) => {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.1, // Lower temperature for more consistent responses
  });
  return response.choices[0]?.message?.content?.trim();
};

const formatUserDetails = (observation) => {
  if (!observation || Object.keys(observation).length === 0) {
    return "Sorry, no user details were found.";
  }

  if (observation.message) {
    return observation.message;
  }

  const { name, DOB, city, pan, mobile, email, address } = observation;
  
  if (!name) {
    return "Sorry, no user details were found.";
  }

  // Calculate the age from the DOB
  const age = DOB ? calculateAge(DOB) : "N/A";

  let formattedResponse = `✅ User Details Found:\n`;
  formattedResponse += `OUTPUT { "type": "output", "output": "${name} is ${age} years old and lives in ${city || 'N/A'}." }\n\n`;
  formattedResponse += `📋 Complete Details:\n`;
  formattedResponse += `- Name: ${name}\n`;
  if (DOB) formattedResponse += `- DOB: ${DOB}\n`;
  if (age !== "N/A") formattedResponse += `- Age: ${age} years\n`;
  if (address) formattedResponse += `- Address: ${address}\n`;
  if (city) formattedResponse += `- City: ${city}\n`;
  if (pan) formattedResponse += `- PAN: ${pan}\n`;
  if (mobile) formattedResponse += `- Mobile: ${mobile}\n`;
  if (email) formattedResponse += `- Email: ${email}\n`;

  return formattedResponse;
};

const chat = async (userPrompt) => {
  console.log(`🟢 User Prompt: ${userPrompt}`);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  try {
    const planningResponse = await sendMessage(messages);
    console.log("🧠 AI Response:\n", planningResponse);

    const action = parseAction(planningResponse);
    if (!action) {
      console.log("❌ No valid ACTION step found in AI response.");
      console.log("🤖 AI Response without function call:", planningResponse);
      return;
    }

    console.log("🔧 Executing function:", action.functionName);
    console.log("📥 With parameters:", action.input);

    const observation = await callFunction(action.functionName, action.input);
    console.log("🔍 Observation:", observation);

    const finalOutput = formatUserDetails(observation);
    console.log(finalOutput);

  } catch (error) {
    console.error("❌ Chat Error:", error.message);
    console.log("💡 Try rephrasing your query. Examples:");
    console.log("- 'Find user with PAN ABGPA5303H'");
    console.log("- 'Get details of user named John'");
    console.log("- 'Search user with mobile 9876543210'");
    console.log("- 'Find user with client ID ABC123'");
  }
};

// Function to prompt the user for input
const getUserInput = () => {
  console.log("\n💬 You can ask me to find users by:");
  console.log("   • PAN number (e.g., 'Find user with PAN ABGPA5303H')");
  console.log("   • Name (e.g., 'Get details of user named John')");
  console.log("   • Mobile number (e.g., 'Find user with mobile 9876543210')");
  console.log("   • Client ID (e.g., 'Search user with client ID ABC123')");
  console.log("\n");
  
  const userPrompt = readlineSync.question(">> ");
  return userPrompt.trim();
};

const main = async () => {
  try {
    // Connect to MongoDB
    console.log("🔄 Connecting to MongoDB...");
    await connectToMongoDB();
    console.log("✅ Connected to MongoDB successfully!");

    while (true) {
      try {
        const userPrompt = getUserInput();
        
        if (userPrompt.toLowerCase() === 'exit' || userPrompt.toLowerCase() === 'quit') {
          console.log("👋 Goodbye!");
          process.exit(0);
        }
        
        if (userPrompt.trim() === '') {
          console.log("⚠️  Please enter a valid query.");
          continue;
        }

        await chat(userPrompt);
        
        console.log("\n" + "=".repeat(50) + "\n");
        
      } catch (error) {
        console.error("❌ Error processing your request:", error.message);
      }
    }
  } catch (error) {
    console.error("❌ Application Error:", error.message);
    process.exit(1);
  }
};

// Start the application
main().catch(console.error);