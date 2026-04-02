import { MongoClient } from "mongodb";

const uri = "mongodb+srv://BFMImage2:BFMImage@cluster0.rwhd1ot.mongodb.net/?appName=Cluster0";

// 👇 FIX: tell TypeScript about global variable
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (!global._mongoClientPromise) {
  client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}

clientPromise = global._mongoClientPromise;

export default clientPromise;