export interface Vendor {
    id: string;
    name: string;
    contact_info: string;
    vendor_group_name: string;
    description?: Text;
    vendors?: Vendor[];
    status?: string;
}
export interface vendorGroupInterface {
    id: string;
    vendor_group_name: string;
    description?: Text;
    vendors: any; 
    hierarchy_levels?: any;
    is_enabled: boolean;
    program_id: string;
    created_on?: bigint;
    updated_on?: bigint;
    created_by?: string;
    updated_by?: string;
    is_deleted: boolean;
    vendor_id?: string;
    program_vendor?: any; 
}

