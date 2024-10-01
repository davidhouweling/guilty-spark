import "dotenv/config";
import express from "express";

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env["PORT"] ?? 3000;

app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
