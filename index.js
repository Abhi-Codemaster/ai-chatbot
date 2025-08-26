import dotenv from "dotenv";
import Groq from "groq-sdk";
import { getUserDetails } from "./controllers/aiController.js";
import connectToMongoDB from "./services/conn_mongo.js";

dotenv.config();
// Connect to MongoDB
connectToMongoDB();

const MODEL = process.env.GROQ_MODEL || "llama3-8b-8192";
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `
You are an AI assistant with START, PLAN, ACTION, OBSERVATION, and OUTPUT states. Follow this process:

1. Wait for user input.
2. PLAN the solution using available tools.
3. Take ACTION with the appropriate tool and capture OBSERVATION.
4. Produce the final OUTPUT based on the START prompt and observations.

Available tools:
1. Weather tool: getWeatherDetails(city: string): string
2. User tool: getUserDetails(user: string): object

Example Interaction:
START { "type": "user", "user": "What is the detail of abhishek?" }
PLAN { "type": "plan", "plan": "I will call getUserDetails for abhishek" }
ACTION { "type": "action", "function": "getUserDetails", "input": "abhishek" }
OBSERVATION { "type": "observation", "observation": { name: "abhishek raghuvanshi", age: "27 year", city: "dhar" } }
OUTPUT { "type": "output", "output": "abhishek raghuvanshi is 27 year old and lives in dhar." }
`;

const parseAction = (message) => {
  try {
    const match = message.match(/"function":\s*"(\w+)",\s*"input":\s*"([^"]+)"/);
    if (!match) return null;
    const [, functionName, input] = match;
    return { functionName, input };
  } catch {
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
  });
  return response.choices[0]?.message?.content?.trim();
};

const chat = async (userPrompt) => {
  console.log(`🟢 User Prompt: ${userPrompt}`);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  try {
    const planningResponse = await sendMessage(messages);
    console.log("🧠 Planning/Action:\n", planningResponse);

    const action = parseAction(planningResponse);
    if (!action) throw new Error("No valid ACTION step found.");

    const observation = await callFunction(action.functionName, action.input);
    console.log("🔍 Observation:\n", observation);

    const observationMessage = {
      role: "assistant",
      content: `OBSERVATION\n{ "type":"observation", "observation": ${JSON.stringify(observation)} }`,
    };

    messages.push({ role: "assistant", content: planningResponse });
    messages.push(observationMessage);

    const finalOutput = await sendMessage(messages);
    console.log("✅ Final Output:\n", finalOutput);
  } catch (error) {
    console.error("❌ Chat Error:", error.message);
  }
};

// 🔁 Example usage
(async () => {
  await chat("What is the detail of vivek?");
})();
