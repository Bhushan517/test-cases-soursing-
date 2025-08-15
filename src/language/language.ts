import { databaseConfig } from "../config/db"
import EN_MESSAGES from "../language/en/messages.language"

let messages: any = null;

if (databaseConfig.config.app_lang == "en") {
    messages = EN_MESSAGES;
}

export default messages;