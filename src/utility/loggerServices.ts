
import axios from 'axios';
import { networkInterfaces, platform } from 'node:os';
import { Model, ModelStatic } from 'sequelize';

function getLocalIpAddress(): string | null {
    const interfaces = networkInterfaces();
    for (const interfaceName in interfaces) {
        const networkInterface = interfaces[interfaceName];
        if (networkInterface) {
            for (const iface of networkInterface) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
    }
    return null;
}

function getOsName(): string {
    return platform();
}





export async function logger(data: any, modelClass?: ModelStatic<Model>): Promise<void> {
    const projectName = process.env.PROJECT_NAME ?? 'simplify-v2-config-node';
    const systemIpAddress = getLocalIpAddress();
    const osName = getOsName();

    const tableName = modelClass ? modelClass.getTableName() : 'unknown_table';
    const logPayload = {
        ...data,
        source: {
            ip_address: systemIpAddress,
            os_name: osName,
        },
        project_name: projectName,
        module: tableName,
    };

    try {
        await axios.post(`${process.env.AUDIT_LOG_URL}/audit-log-service/log`, logPayload);
    } catch (error: any) {
        console.error('Failed to log data:', error.message);
    }
}

