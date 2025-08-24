export function getUserDetails(user = "") {
  const userMap = {
    abhishek: {
        name: "abhishek raghuvanshi",
        age: "27 year",
        city: "dhar",
    },
    vivek: {
        name: "vivek raghuvanshi",
        age: "12 year",
        city: "indore",
    },
    minakshi: {
        name: "minakshi raghuvanshi",
        age: "28 year",
        city: "bhopal",
    }
  };
  return userMap[user.toLowerCase()] || "User data not available";
}