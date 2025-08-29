import {find_one2,find_all2} from "../services/crud_mongo.js"

export const getUserDetails = async (params) => {
  // Build a dynamic query object
  const query = {};
  
  if (params.clientId) {
    query.ID = params.clientId;
  }
  if (params.PAN) {
    query.pan = { $regex: new RegExp(params.PAN, "i") };
  }
  if (params.name) {
    query.name = { $regex: new RegExp(params.name, "i") };
  }
  if (params.mobile) {
    query.mobile = params.mobile;
  }

  const param = {
    modelName: "client_batch",
    where: query,
    select: {
      _id: 1,
      ID: 1,
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

export const calculateAUM = async (params) => {
  // Build a dynamic query object
  const query = {};

  if (params.arn_id) {
    query.arn_id = params.arn_id;
  }
  if (params.agentCode) {
    query.agentCode = params.agentCode;
  }
  if (params.clientId) {
    query.ID = params.clientId;
  }

  const param = {
    modelName: "present_day_summary",
    where: query,
    select: {
      cur_val: 1,
      units: 1,
      pur_nav: 1,
    },
  };

  try {
    // Fetch all matching records (not just one)
    const records = await find_all2(param);

    if (!records || records.length === 0) {
      console.log("No records found for the given parameters:", params);
      return { message: "No records found for these details." };
    }

    // Calculate total AUM
    let totalAUM = 0;
    for (const rec of records) {
      // Prefer cur_val if present, otherwise calculate manually
      if (rec.cur_val) {
        totalAUM += parseFloat(rec.cur_val);
      } else if (rec.units && rec.pur_nav) {
        totalAUM += parseFloat(rec.units) * parseFloat(rec.pur_nav);
      }
    }

    return { totalAUM, count: records.length };
  } catch (error) {
    console.error("Error calculating AUM:", error.message);
    return { message: "Error calculating AUM." };
  }
};

export const getTransactionDetails = async (params) => {
  const { clientId, limit = 10, transactionType, dateFrom, dateTo } = params;
  if (!clientId) {
    return { message: "Client ID is required to fetch transactions." };
  }
  // Build query object
  const query = {
    clientID: clientId, // or ID: clientId if that's the field name
  };
  // Add optional filters
  if (transactionType) {
    query.appTransType = transactionType; // or whatever field represents transaction type
  }
  if (dateFrom || dateTo) {
    query.transDate = {};
    if (dateFrom) {
      query.transDate.$gte = dateFrom;
    }
    if (dateTo) {
      query.transDate.$lte = dateTo;
    }
  }
  const param = {
    modelName: "transaction_batch", // Replace with your actual transaction collection name
    where: query,
    select: {
      _id: 1,
      ID: 1,
      transactionID: 1,
      folioNumber: 1,
      fundDesc: 1,
      transDate: 1,
      processDt: 1,
      appTransDesc: 1,
      appTransType: 1,
      amt: 1,
      unit: 1,
      price: 1,
      nav: 1,
      transStatus: 1,
      schemeCode: 1,
      branchName: 1,
      agentCode: 1,
      ISIN: 1,
      conclusion_desc: 1,
    },
    sort: { transDate: -1, processDt: -1 }, // Sort by transaction date descending
    limit: parseInt(limit),
  };
  try {
    const transactions = await find_all2(param);
    if (!transactions || transactions.length === 0) {
      console.log("No transactions found for client:", clientId);
      return { 
        message: "No transactions found for this client.",
        clientId: clientId,
        transactions: []
      };
    }
    return {
      clientId: clientId,
      transactionCount: transactions.length,
      transactions: transactions
    };
  } catch (error) {
    console.error("Error fetching transaction details:", error.message);
    return { message: "Error fetching transaction details." };
  }
};