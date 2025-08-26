import {find_one2} from "../services/crud_mongo.js"
import table from "../collection.json";

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

export const getUserDetails = async (arnId,clientId,) => {
  paran = {
    modelName: table,
    where: {arnId:arnId,clientId:clientId}
  }
  const userDetails = await find_one2(param)
  return userDetails;
}