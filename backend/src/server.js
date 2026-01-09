require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");

// __dirname ka sahi use karke paths fix kiye
const app = require(path.join(__dirname, "app")); 
const { startStatusUpdater } = require(path.join(__dirname, "services/cron.service"));

const PORT = process.env.PORT || 3000;

/* -------------------- FRONTEND (VITE BUILD) -------------------- */

// dist folder path (backend/src ke bahar root mein dist folder)
const distPath = path.resolve(__dirname, "../../dist");

app.use(express.static(distPath));

// API ke alawa sab index.html (React Router)
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

/* -------------------- DATABASE + SERVER -------------------- */

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);

      try {
        startStatusUpdater();
        console.log("⏰ Status Updater Cron Started");
      } catch (err) {
        console.error("❌ Cron failed to start:", err.message);
      }
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1);
  });
