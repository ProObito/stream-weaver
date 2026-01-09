require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");

const app = require("./app"); // app.js se express instance
const { startStatusUpdater } = require("./services/cron.service");

const PORT = process.env.PORT || 3000;

/* -------------------- FRONTEND (VITE BUILD) -------------------- */

// dist folder path (root/dist)
const distPath = path.join(__dirname, "../../dist");

// static files
app.use(express.static(distPath));

// React Router support (API ke alawa sab index.html)
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

      // Cron jobs start
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
