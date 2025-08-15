import jobRepository from "../repositories/job.repository";

const JobRepository = new jobRepository();

class InterviewService {

    async getJobIdsForUserType(program_id: string, userId: string, userType: string | undefined): Promise<string[]> {
        if (userType === 'super_user') {
            return [];
        }

        const userData = await JobRepository.findUser(program_id, userId);

        if (userData && userData.length > 0) {
            const user_type = userData[0]?.user_type;
            const hierarchyIdsArray = userData[0]?.associate_hierarchy_ids ?? [];

            if (user_type) {
                if (user_type.toUpperCase() === "CLIENT" || user_type.toUpperCase() === "MSP") {
                    if ((hierarchyIdsArray.length === 0 || !hierarchyIdsArray)) {
                        return await JobRepository.getAllJobIds(program_id);
                    } else {
                        return await JobRepository.getJobIdsWithHierarchies(program_id, hierarchyIdsArray);
                    }
                } else if (user_type.toUpperCase() === "VENDOR") {
                    return await JobRepository.getVendorJobIds({program_id, userId, isOptOut: true});
                } else {
                    return await JobRepository.getAllJobIds(program_id);
                }
            }
        }

        return [];
    }
}

export default InterviewService;