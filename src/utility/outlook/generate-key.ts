import crypto from "crypto";

const key = crypto.randomBytes(32).toString("base64");

console.log(`ENCRYPTION_KEY=${key}`);
