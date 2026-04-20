import nodemailer from "nodemailer";

let cachedTransporter = null;
let cachedFingerprint = "";

function parseBool(value, fallback = false) {
  const raw = `${value ?? ""}`.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function readSmtpConfigFromEnv() {
  const host = `${process.env.SMTP_HOST || ""}`.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = parseBool(process.env.SMTP_SECURE, false);
  const requireTls = parseBool(process.env.SMTP_REQUIRE_TLS, false);
  const user = `${process.env.SMTP_USER || ""}`.trim();
  const pass = `${process.env.SMTP_PASS || ""}`;
  const from = `${process.env.SMTP_FROM || ""}`.trim();
  const replyTo = `${process.env.SMTP_REPLY_TO || ""}`.trim();
  const pool = parseBool(process.env.SMTP_POOL, true);

  return {
    host,
    port: Number.isFinite(port) ? Math.max(1, Math.min(65535, port)) : 587,
    secure,
    requireTls,
    user,
    pass,
    from,
    replyTo,
    pool
  };
}

function getFingerprint(cfg) {
  return [
    cfg.host,
    cfg.port,
    cfg.secure,
    cfg.requireTls,
    cfg.user,
    cfg.pass ? "set" : "",
    cfg.from,
    cfg.replyTo,
    cfg.pool
  ].join("|");
}

export function getSmtpStatus() {
  const cfg = readSmtpConfigFromEnv();
  const configured = Boolean(cfg.host && cfg.port && cfg.from);
  const authConfigured = Boolean(cfg.user && cfg.pass);
  return {
    configured,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTls: cfg.requireTls,
    authConfigured,
    authUser: cfg.user || "",
    from: cfg.from,
    replyTo: cfg.replyTo,
    pool: cfg.pool
  };
}

export function resetSmtpTransport() {
  cachedTransporter = null;
  cachedFingerprint = "";
}

function getTransporter() {
  const cfg = readSmtpConfigFromEnv();
  if (!cfg.host || !cfg.port || !cfg.from) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, and SMTP_FROM.");
  }

  const fingerprint = getFingerprint(cfg);
  if (cachedTransporter && cachedFingerprint === fingerprint) {
    return { transporter: cachedTransporter, cfg };
  }

  const transportOptions = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: cfg.requireTls,
    pool: cfg.pool
  };

  if (cfg.user && cfg.pass) {
    transportOptions.auth = {
      user: cfg.user,
      pass: cfg.pass
    };
  }

  cachedTransporter = nodemailer.createTransport(transportOptions);
  cachedFingerprint = fingerprint;
  return { transporter: cachedTransporter, cfg };
}

export async function verifySmtpConnection() {
  const { transporter } = getTransporter();
  await transporter.verify();
  return { ok: true };
}

export async function sendSystemEmail({ to, subject, text, html, cc, bcc, replyTo }) {
  const { transporter, cfg } = getTransporter();
  const info = await transporter.sendMail({
    from: cfg.from,
    to,
    cc,
    bcc,
    replyTo: replyTo || cfg.replyTo || undefined,
    subject,
    text,
    html
  });
  return {
    messageId: `${info.messageId || ""}`,
    accepted: Array.isArray(info.accepted) ? info.accepted : [],
    rejected: Array.isArray(info.rejected) ? info.rejected : []
  };
}
