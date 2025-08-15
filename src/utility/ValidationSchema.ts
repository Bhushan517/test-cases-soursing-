import { JobValidationSchema } from "../interfaces/job.interface";

export function validateJobRequest(data: any): { isValid: boolean; errors: string[] } {
    const validationResult = JobValidationSchema.safeParse(data);

    if (!validationResult.success) {
        console.log(validationResult.error);

        const errors = validationResult.error.errors.map(err =>
            `${err.path.join('.')} ${err.message}`
        );
        return { isValid: false, errors };
    }

    return { isValid: true, errors: [] };
}


export { JobValidationSchema };