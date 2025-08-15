import { FastifyReply } from "fastify";

class Reply {
    statusCode: number = 200;
    message: string | null = null;
    error: string | null = null;
    errors: any[] = [];
    traceId: string | null = null;
    total_records: number | undefined = 0;
    total_pages: number | undefined = 0;
    current_page: number | undefined = 0;
    page_size: number | undefined = 0;
    items_per_page: number | undefined = 0;
    mainKey: string;
    mainData: any[] = [];

    constructor(mainKey: string) {
        this.mainKey = mainKey;
    }

    setMainData(data: any[]) {
        this.mainData = data;
    }

    sendResponse(reply: FastifyReply) {
        const res: any = {
            status_code: this.statusCode,
            message: this.message,
            [this.mainKey]: this.mainData,
            total_records: this.total_records,
            total_pages: this.total_pages,
            current_page: this.current_page,
            page_size: this.page_size,
            items_per_page: this.items_per_page,
            error: this.error,
            errors: this.errors,
            trace_id: this.traceId,
        };
        return reply.status(this.statusCode).send(res);
    }
}

export default Reply;