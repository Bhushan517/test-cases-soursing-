import { databaseConfig } from '../config/db';
const CONFIG_SERVICE_URL = databaseConfig.config.config_url;
const AI_URL=databaseConfig.config.ai_url;
import submissionCandidateModel from '../models/submission-candidate.model';


export async function createMtp(
    programId: string,
    mtpCandidateId: string,
    authHeader: string,
    userId: string | undefined,
) {
    console.log("Creating MTP with payload:", {
        programId,  
        mtpCandidateId,
        authHeader,
        userId,
    });
    const configUrl = `${CONFIG_SERVICE_URL}/v1/api/program/${programId}/mtp`;

    const payload = {
        program_id: programId,
        mtp_candidate_id: mtpCandidateId,
        linked_profiles:[mtpCandidateId],
        created_by: userId,
        updated_by: userId,
    };
    console.log("payload",payload)
    const maxRetries = 3;
    let attempt = 0;
    let lastError;

    while (attempt < maxRetries) {
        try {
            const response = await fetch(configUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authHeader}`,
                },
                body: JSON.stringify(payload),
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Attempt ${attempt + 1} failed: ${response.status} - ${errorText}`);
                lastError = new Error(errorText);
            } else {
                const responseData = await response.json();
                console.log("MTP created successfully:", responseData);
                return responseData;
            }
        } catch (error) {
            console.error(`Attempt ${attempt + 1} - Error creating MTP:`, error);
            lastError = error;
        }

        attempt++;
        if (attempt < maxRetries) {
            await new Promise(res => setTimeout(res, 1000 * attempt));
        }
    }
    return Error(`Failed to create MTP after ${maxRetries} attempts: ${lastError}`);
    
}

export async function getSubmissionCandidateScoringDetails(
    jobDiscription: string,
    candidateId: string, 
    authHeader: string,
    jobTitle:string
  ) {
    console.log("Creating MTP with payload:", {
      jobDiscription,
      candidateId,
      authHeader,
      jobTitle
    });
  
    const configUrl = `${AI_URL}/batch-match-jd`;
  
    const payload = {
      job_description: jobDiscription,
      candidate_ids: candidateId,
      job_title: jobTitle,
    };
  
    console.log("Payload:", payload);
  
    const maxRetries = 3;
    let attempt = 0;
    let lastError;
  
    while (attempt < maxRetries) {
      try {
        console.log(`Attempt ${attempt + 1} - Sending batch match job request...`);
        const response = await fetch(configUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
          },
          body: JSON.stringify(payload),
        });
  
        if (!response.ok) {
          throw new Error(`API request failed with status: ${response.status} ${response.statusText}`);
        }
  
        const result = await response.json();
        console.log(`Attempt ${attempt + 1}: Response status`, result);
        console.log("Update submission response data:", result);
        
        if (!result.success || !Array.isArray(result.matches)) {
          return new Error(`Unexpected response format: ${JSON.stringify(result)}`);
        }
  
        for (const match of result.matches) {
          try {
            if (match.candidate_id && typeof match.score === 'number') {
              await updateCandidateScore(match.candidate_id, match.score);
            } else {
              console.warn(`Skipping invalid match data:`, match);
            }
          } catch (updateError) {
            console.error(`Failed to update candidate ${match.candidate_id}:`, updateError);
          }
        }
        return result.matches;
  
      } catch (error) {
        console.error(`Attempt ${attempt + 1} - Error processing MTP:`, error);
        lastError = error;
      }
  
      attempt++;
      if (attempt < maxRetries) {
        console.log(`Retrying in ${1000 * attempt}ms...`);
        await new Promise((res) => setTimeout(res, 1000 * attempt));
      }
    }
    return new Error(`Failed to process submission after ${maxRetries} attempts: ${lastError}`);
  }


export async function updateCandidateScore(candidateId: string, score: number): Promise<number> {
    try {
      const candidateScore = [{
        candidate_id: candidateId,
        score: score
      }];
      
      const [updated] = await submissionCandidateModel.update(
        {
          scores: candidateScore,
          is_duplicate_submission: true,
        },
        {
          where: { candidate_id: candidateId },
        }
      );
      if (updated === 0) {
        console.warn(`No record updated for candidate ID: ${candidateId}`);
      } else {
        console.log(`Updated candidate ID: ${candidateId} with score: ${score}`);
      }
      return updated;
    } catch (error) {
      console.error(`Error updating score for candidate ID ${candidateId}:`, error);
      throw error;
    }
  }