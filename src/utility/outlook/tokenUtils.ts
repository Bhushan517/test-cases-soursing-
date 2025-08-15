import crypto from "crypto";
import dotenv from "dotenv";
import {databaseConfig} from "../../config/db";

dotenv.config();

const config = databaseConfig.config;


const ENCRYPTION_KEY_BASE64 = config.encryption_key || "o2ioHXDtKzImoJQ/1DFt6nMhmf5TwiZEF1F6F30/tBI=";
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_BASE64, "base64");
const IV_LENGTH = 16;

if (ENCRYPTION_KEY.length !== 32) {
   console.log('`ENCRYPTION_KEY must be 32 bytes after decoding from base64. Current length: ${ENCRYPTION_KEY.length}`');
}


export function encryptToken(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf-8"), cipher.final()]);

    return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptToken(encryptedText: string): string {
    const parts = encryptedText.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encryptedBuffer = Buffer.from(parts[1], "hex");

    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
    const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);

    return decrypted.toString("utf-8");
}
