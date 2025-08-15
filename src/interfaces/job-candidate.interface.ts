    export interface JobCandidateInterface {
        id: any;
        job_id: string;
        program_id: string;
        first_name: string;
        is_enabled: boolean;
        middle_name?: string;  
        last_name: string;
        email: string;
        phone_number: string;
        vendor: string; 
        notes?: string;  
    }
