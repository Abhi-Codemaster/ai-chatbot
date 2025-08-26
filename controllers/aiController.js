import {find_one2} from "../services/crud_mongo.js"

// export function getUserDetails(user = "") {
//   const userMap = {
//     abhishek: {
//         name: "abhishek raghuvanshi",
//         age: "27 year",
//         city: "dhar",
//     },
//     vivek: {
//         name: "vivek raghuvanshi",
//         age: "12 year",
//         city: "indore",
//     },
//     minakshi: {
//         name: "minakshi raghuvanshi",
//         age: "28 year",
//         city: "bhopal",
//     }
//   };
//   return userMap[user.toLowerCase()] || "User data not available";
// }

export const getUserDetails = async (arnId, clientId) => {
  const param = {
    modelName: "client_batch",
    where: { arn_id: parseInt(arnId), ID: clientId },
    select: {
      _id: 1,
      name: 1,
      address: 1,
      mobile: 1,
      email: 1,
      pan: 1,
      DOB: 1,
      city: 1,
    },
  };

  try {
    const userDetails = await find_one2(param);

    if (!userDetails) {
      console.log("No user found for arnId:", arnId, "and clientId:", clientId);
      return { message: "No user found for these IDs." }; // Return a meaningful error message
    }
    return userDetails;
  } catch (error) {
    console.error("Error fetching user details:", error.message);
    return { message: "Error fetching user details." };
  }
};
