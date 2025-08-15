import { randomUUID } from 'crypto'

export default function generateCustomUUID(): string {
    const uuid = randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    return `${uuid}-${timestamp}`;
}