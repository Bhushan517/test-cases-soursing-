export interface DecodedToken {
    user_id: string;
    userType: string;
    username: string;
    realm_access: {
        roles: string[];
    };
    resource_access: {
        [resource: string]: {
            roles: string[];
        };
        account: { roles: string[] };
    };
    impersonator?: {
        id: string;
    };
}