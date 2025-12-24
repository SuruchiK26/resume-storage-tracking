import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";

import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient } from "@azure/cosmos";

dotenv.config();

// import crypto from "node:crypto";
// import express from "express";
const PORT = process.env.PORT || 80;

// Validate required environment variables early so Azure logs show clear errors
function validateEnv() {
  const required = [
    'CONTAINER_NAME',
    'DATABASE_NAME',
    'CONTAINER_DB'
  ];

  // Storage credentials: either AZURE_STORAGE_CONNECTION_STRING or (BLOB_ACCOUNT + BLOB_KEY)
  if (!process.env.AZURE_STORAGE_CONNECTION_STRING && !(process.env.BLOB_ACCOUNT && process.env.BLOB_KEY)) {
    required.push('AZURE_STORAGE_CONNECTION_STRING or (BLOB_ACCOUNT and BLOB_KEY)');
  }

  // Cosmos credentials
  if (!process.env.COSMOS_URI || !process.env.COSMOS_KEY) {
    required.push('COSMOS_URI and COSMOS_KEY');
  }

  const missing = required.filter(Boolean).filter((name) => {
    // custom string for the storage credentials check
    if (name.startsWith('AZURE_STORAGE_CONNECTION_STRING')) {
      return !process.env.AZURE_STORAGE_CONNECTION_STRING && !(process.env.BLOB_ACCOUNT && process.env.BLOB_KEY);
    }
    return !process.env[name];
  });

  if (missing.length) {
    console.error('Missing required environment variables:', missing.join(', '));
    console.error('Application will exit. Set the missing variables in Azure App Settings or provide a .env for local development.');
    process.exit(1);
  }
}

validateEnv();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

/* ---------------- BLOB STORAGE ---------------- */

const storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING ||
  `DefaultEndpointsProtocol=https;AccountName=${process.env.BLOB_ACCOUNT};AccountKey=${process.env.BLOB_KEY};EndpointSuffix=core.windows.net`;

const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);

const containerClient = blobServiceClient.getContainerClient(process.env.CONTAINER_NAME);

/* ---------------- COSMOS DB ---------------- */

const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOS_URI,
  key: process.env.COSMOS_KEY
});

const database = cosmosClient.database(process.env.DATABASE_NAME);
const candidates = database.container(process.env.CONTAINER_DB);

/* ---------------- ROUTES ---------------- */

// Upload Resume

app.get("/", (req, res) => {
  res.send("Backend is LIVE on Azure");
});



app.post("/api/upload", upload.single("resume"), async (req, res) => {
  try {
    const { name, skills } = req.body;
    const file = req.file;

    if (!file) return res.status(400).send("No file uploaded");

    const blobName = `${Date.now()}-${file.originalname}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: "application/pdf" }
    });

    const resumeUrl = blockBlobClient.url;

    const candidate = {
      id: Date.now().toString(),
      name,
      skills: skills.split(","),
      resumeUrl,
      uploadedAt: new Date().toISOString()
    };

    await candidates.items.create(candidate);

    res.status(200).json({ message: "Resume uploaded successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Upload failed");
  }
});

// Get Candidates
app.get("/api/candidates", async (req, res) => {
  const { resources } = await candidates.items
    .query("SELECT * FROM c")
    .fetchAll();
  res.json(resources);
});




app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
