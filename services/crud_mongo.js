import mongoose from 'mongoose';
// require('./schema_register');

const deleteQuery = async(query_params)=>{
    const { modelName, condition, query_type = "default"} = query_params;
    const groupModel = mongoose.model(modelName);
    let delete_data = '';
    switch (query_type) {
        case "deleteOne":
            delete_data = await groupModel.deleteOne(condition);
            break;
        default:
            delete_data = await groupModel.deleteMany(condition);
            break;
    }
    return delete_data;
};

const insertquery = async(query_params)=>{
    const { modelName, data, queryType = 'default'} = query_params;
    const groupModel = mongoose.model(modelName);
    let insert ='';
    switch (queryType) {
      case "1":
          insert = await groupModel.insertMany(data);
          break;
      default:
          insert = await groupModel.create(data);
          break;
    }

    return insert;
};

const distinctQuery = async(query_params)=>{
    const { modelName, distinct_name, where } = query_params;
    const groupModel = mongoose.model(modelName);
    const distinct_data = await groupModel.distinct(distinct_name, where );
    return distinct_data;
};

const find_all = async(query_params)=>{
    const { modelName, where = {}, select = {}, sort = {} ,limit = 0, skip = 0 } = query_params;
   
    const groupModel = mongoose.model(modelName);
    return await groupModel.find(where, select).sort(sort).limit(limit).skip(skip).lean();
};

const find_one = async(query_params)=>{
    const { modelName, where = {}, select = {}, sort = {} ,limit = 0, skip = 0 } = query_params;

    const groupModel = mongoose.model(modelName);
    return await groupModel.findOne(where, select).sort(sort).limit(limit).skip(skip).lean();
};

const update = async(query_params)=>{
    const {modelName, where, updateData, queryType} = query_params;

    const groupModel = mongoose.model(modelName);
    let update='';
    switch (queryType) {
        case 'updateOne':
            update = await groupModel.updateOne(where, updateData);        
            break;
        case 'updateMany':
            update = await groupModel.updateMany(where, updateData);
            break;
        default:
            update = await groupModel.findOneAndUpdate(where, updateData, {upsert:true, new : true});                   
            break;
    }
    return update;
};

const count_records = async (query_params)=>{
    const { modelName, condition= {} } = query_params;
    const groupModel = mongoose.model(modelName);
    return await groupModel.countDocuments(condition);
};

const find_raw = async (query_params) => {
    const {modelName, where = {}} = query_params;
    return await mongoose.collection(modelName).find(where.condition).toArray();
};

const find_distinct = async(query_params)=>{
    const {modelName, distinct_key, where = {}} = query_params;
    return await mongoose.model(modelName).distinct(distinct_key, where);
};

const group_by = async(query_params)=>{

    const { modelName, where = {}, groupData = {} } = query_params;

    const groupModel = mongoose.model(modelName);

    const data1 = await groupModel.aggregate([
        {
          $match: where
        },
        {
          $group: groupData
        }
      ]);
    
    return data1;
};

const project_aggre = async (query_params) => {

    const { modelName, project = {}, match } = query_params;
    const groupModel = mongoose.model(modelName);
    const data1 = await groupModel.aggregate([{ $match : match } ,{ $project: project }]);
    return data1;

};



//For autoDD

async function find_all2(query_params){
  const {modelName, where = {}, select = {}, sort = {}, limit = 0, skip = 0} = query_params;
  let collection = mongoose.connection.db.collection(modelName);
  let data = await collection.find(where, {projection:select, limit, sort, skip}).toArray();
  return data;
}

export const find_one2 = async(query_params)=>{
  const { modelName, where = {}, select = {} } = query_params;

  let collection = mongoose.connection.db.collection(modelName);
  return await collection.findOne(where, {projection:select});
};

// const createCollection = async(data, )=>{

//     try {
//         var myObj = data;
//         let collection = await mongoose.connection.db.collection("auto_dd_difference_test").insertOne(myObj);
//         console.log(collection);
//         return collection;
//     } catch (error) {
//         console.log("Error in insering");
//     }

// };


const insertquery2 = async(query_params)=>{
  const {modelName, queryType='default', data={}} = query_params;
  const collection = mongoose.connection.db.collection(modelName);
  let queryRes = '';
  switch (queryType) {
    case "1":
      queryRes = await collection.insertOne(data);
      break;
    default:
      queryRes = await collection.insertMany(data);
      break;
  }

  return queryRes;
};


const updatequery2 = async(query_params)=>{
  const {modelName, where, updateData, queryType} = query_params;
  const collection = mongoose.connection.db.collection(modelName);
  let data = '';
  switch (queryType) {
    case "updateOne":
      data = await collection.updateOne(where, updateData);
      break;
    case "updateMany":
      data = await collection.updateMany(where, updateData);
      break;
    default:
      data = await collection.findOneAndUpdate(where, updateData, {upsert:true});
      break;
  }

  return data;
};


const deletequery2 = async(query_params)=>{
  const { modelName, condition, query_type = "default"} = query_params;
  const collection = mongoose.connection.db.collection(modelName);
  let data = '';
  switch (query_type) {
    case "deleteOne":
      data = await collection.deleteOne(condition);
      break;
    default:
      data = await collection.deleteMany(condition);
      break;
  }

  return data;
};

const count_records2 = async (query_params)=>{
  const { modelName, where= {} } = query_params;
  const collection = mongoose.connection.db.collection(modelName);

  return await collection.countDocuments(where);
};


const mongoAggregate2 = async(query_params)=>{
  const {modelName, groupBy, dataShow='$$ROOT', match, sort} = query_params; 

  let collection = mongoose.connection.db.collection(modelName);
    let data = await collection.aggregate([
        {$match : match},
        {
            $group:{
                _id:groupBy,
                datas : {$push: dataShow}
            }
        },
        {$sort : sort}
    ]).toArray();

    return data;
};

const joinQuery = async(query_params) => {
    const { modelName, joinTblName, localField = "", foreignField = "", as="", where = {}, select = {}, sort = {}, limit = 0, skip = 0 } = query_params;

    let collection = mongoose.connection.db.collection(modelName);
    const result = await collection.aggregate([
      {
          $lookup: {
              from: joinTblName,
              localField: localField,
              foreignField: foreignField,
              as: as
          }
      },
      // {
      //     $unwind: '$customer' // In case there's only one matching customer
      // },
      {
          $match: where
      },
      {
          $project: select
      },
      {
          $sort: sort
      },
      {
          $skip: skip // Offset
      },
      {
          $limit: limit // Limit
      }
    ]).toArray();

    return result;
};

const find_distinct2 = async ({ modelName, key, where = {} }) => {
  const collection = mongoose.connection.db.collection(modelName);
  return await collection.distinct(key, where);
};


// module.exports = { deleteQuery, insertquery, distinctQuery, find_all, find_one, find_raw, update, count_records, find_distinct, find_distinct2, group_by, project_aggre, find_all2, find_one2, insertquery2, updatequery2, deletequery2, count_records2, mongoAggregate2, joinQuery};