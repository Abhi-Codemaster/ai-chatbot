import dotenv from "dotenv";
import Groq from "groq-sdk";
import { getUserDetails } from "./controllers/aiController.js";
import connectToMongoDB from "./services/conn_mongo.js";
import readlineSync from "readline-sync";

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
1. Weather tool: getWeatherDetails(city: string): string
2. User tool: getUserDetails(arnId: string, clientId: string): object

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

    let inputParams = {};

    if (input.includes("arnId") && input.includes("clientId")) {
      // Format: "arnId 8 clientId 5535"
      const cleanedInput = input.replace(/and/g, "").trim();
      const inputArr = cleanedInput.split(/\s+/);
      for (let i = 0; i < inputArr.length; i += 2) {
        inputParams[inputArr[i]] = inputArr[i + 1];
      }
    } else if (input.includes(",")) {
      // Format: "8, 5535"
      const [arnId, clientId] = input.split(",").map(str => str.trim());
      inputParams = { arnId, clientId };
    }

    return { functionName, input: inputParams };
  } catch (err) {
    console.error("Error parsing action:", err);
    return null;
  }
};


const callFunction = async (functionName, input) => {
  switch (functionName) {
    case "getUserDetails":
      return await getUserDetails(input.arnId, input.clientId);
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

// const chat = async (userPrompt) => {
//   console.log(`🟢 User Prompt: ${userPrompt}`);

//   const messages = [
//     { role: "system", content: SYSTEM_PROMPT },
//     { role: "user", content: userPrompt },
//   ];

//   try {
//     const planningResponse = await sendMessage(messages);
//     console.log("🧠 Planning/Action:\n", planningResponse);

//     const action = parseAction(planningResponse);
//     if (!action) throw new Error("No valid ACTION step found.");

//     const observation = await callFunction(action.functionName, action.input);
//     console.log("🔍 Observation:\n", observation);

//     const observationMessage = {
//       role: "assistant",
//       content: `OBSERVATION\n{ "type":"observation", "observation": ${JSON.stringify(observation)} }`,
//     };

//     messages.push({ role: "assistant", content: planningResponse });
//     messages.push(observationMessage);

//     const finalOutput = await sendMessage(messages);
//     console.log("✅ Final Output:\n", finalOutput);
//   } catch (error) {
//     console.error("❌ Chat Error:", error.message);
//   }
// };

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

    if (observation && Object.keys(observation).length > 0) {
      const { name, DOB, city, pan, mobile, email } = observation;

      // Calculate the age from the DOB
      const age = calculateAge(DOB);

      const formattedResponse = `
        OUTPUT { "type": "output", "output": "${name} is ${age} years old and lives in ${city}." }
        - Name: ${name}
        - DOB: ${DOB}
        - Address: ${observation.address}
        - City: ${city}
        - PAN: ${pan}
        - Mobile: ${mobile}
        - Email: ${email}
      `;

      console.log(formattedResponse);
    } else {
      const finalOutput = "Sorry, no details were found.";
      console.log("✅ Final Output:\n", finalOutput);
    }
  } catch (error) {
    console.error("❌ Chat Error:", error.message);
  }
};


// Function to prompt the user for input
const getUserInput = () => {
  const userPrompt = readlineSync.question("Please enter your prompt (e.g., 'What are the details of user arnId 8 and clientId 5535?'): ");
  return userPrompt;
};

// Function to calculate age from DOB
const calculateAge = (dob) => {
  const birthDate = new Date(dob);
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();
  
  // If birthday hasn't occurred yet this year, subtract one year
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    return age - 1;
  }
  return age;
};


(async () => {
  
  // Connect to MongoDB
  await connectToMongoDB();
  
  const userPrompt = getUserInput(); // Get user input using readline-sync
  await chat(userPrompt);
})();
