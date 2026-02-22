/**
 * Express server that serves the web UI and parish APIs.
 */

const express = require("express");
const path = require("path");
const session = require("express-session");

const authRouter = require("./src/routes/auth");
const userRouter = require("./src/routes/user");
const parishesRouter = require("./src/routes/parishes");
const { initSchema, migrate } = require("./src/db");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "orthodox-parish-directory-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

// ── Static files ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Routes ────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api", parishesRouter);

// ── Database setup ────────────────────────────────────────────────────
initSchema();
migrate();

// ── Start server ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
