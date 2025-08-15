    export function parseValue(value: string | null): any {
        if (!value) return null;

        try {
            const parsed = JSON.parse(value);
            return parsed;
        } catch {
            if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
                return value.slice(1, -1);
            }
            return value;
        }
    }