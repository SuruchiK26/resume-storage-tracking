import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";

import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from "@azure/storage-blob";
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

    // Normalize skills: accept CSV or JSON array string
    let skillsArray = [];
    if (Array.isArray(skills)) {
      skillsArray = skills;
    } else if (typeof skills === 'string') {
      const s = skills.trim();
      try {
        // try parse JSON array
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          skillsArray = parsed;
        } else {
          skillsArray = s.split(",").map(x => x.trim()).filter(Boolean);
        }
      } catch (e) {
        skillsArray = s.split(",").map(x => x.trim()).filter(Boolean);
      }
    }

    const blobName = `${Date.now()}-${file.originalname}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.mimetype || "application/pdf" }
    });

    const resumeUrl = blockBlobClient.url;

    const candidate = {
      id: Date.now().toString(),
      name,
      skills: skillsArray,
      resumeUrl,
      blobName,
      originalName: file.originalname,
      uploadedAt: new Date().toISOString()
    };

    await candidates.items.create(candidate);

    res.status(200).json({ message: "Resume uploaded successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Upload failed");
  }
});

// Get Candidates (optional skill filter)
app.get("/api/candidates", async (req, res) => {
  try {
    const { skill } = req.query;
    if (skill) {
      const querySpec = {
        query: "SELECT * FROM c WHERE ARRAY_CONTAINS(c.skills, @skill)",
        parameters: [{ name: "@skill", value: skill }]
      };
      const { resources } = await candidates.items.query(querySpec).fetchAll();
      return res.json(resources);
    }
    const { resources } = await candidates.items.query("SELECT * FROM c").fetchAll();
    res.json(resources);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch candidates");
  }
});

// Download resume (generates short-lived SAS if possible)
app.get('/api/download/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const querySpec = {
      query: 'SELECT c.blobName, c.resumeUrl FROM c WHERE c.id = @id',
      parameters: [{ name: '@id', value: id }]
    };
    const { resources } = await candidates.items.query(querySpec).fetchAll();
    if (!resources || resources.length === 0) return res.status(404).send('Candidate not found');

    const { blobName, resumeUrl } = resources[0];
    if (!blobName && resumeUrl) return res.redirect(resumeUrl);

    // Helper: get shared key cred from env
    function getSharedKey() {
      const account = process.env.BLOB_ACCOUNT;
      const accountKey = process.env.BLOB_KEY;
      if (account && accountKey) return new StorageSharedKeyCredential(account, accountKey);
      const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
      if (conn) {
        const parts = conn.split(';');
        const obj = {};
        parts.forEach(p => {
          const [k, v] = p.split('=');
          obj[k] = v;
        });
        if (obj.AccountName && obj.AccountKey) return new StorageSharedKeyCredential(obj.AccountName, obj.AccountKey);
      }
      return null;
    }

    const sharedKey = getSharedKey();
    if (!sharedKey) {
      // Fall back to stored resumeUrl if container is public
      if (resumeUrl) return res.redirect(resumeUrl);
      return res.status(500).send('Storage credentials not available to generate download link');
    }

    const expiresOn = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: process.env.CONTAINER_NAME,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn
      },
      sharedKey
    ).toString();

    const blobUrl = `${containerClient.getBlockBlobClient(blobName).url}?${sasToken}`;
    return res.redirect(blobUrl);
  } catch (err) {
    console.error(err);
    res.status(500).send('Download failed');
  }
});




app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
