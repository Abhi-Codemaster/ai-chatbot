import {find_one2} from "../services/crud_mongo.js"

export const getUserDetails = async (params) => {
  // Build a dynamic query object
  const query = {};
  
  if (params.clientId) {
    query.ID = params.clientId;
  }
  if (params.PAN) {
    query.pan = params.PAN;
  }
  if (params.name) {
    query.name = { $regex: new RegExp(params.name, "i") }; // Case-insensitive match
  }
  if (params.mobile) {
    query.mobile = params.mobile;
  }

  const param = {
    modelName: "client_batch",
    where: query,
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
      console.log("No user found for the given parameters:", params);
      return { message: "No user found for these details." }; // Return a meaningful error message
    }
    return userDetails;
  } catch (error) {
    console.error("Error fetching user details:", error.message);
    return { message: "Error fetching user details." };
  }
};