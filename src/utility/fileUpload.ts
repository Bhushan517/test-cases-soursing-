import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { Readable } from 'stream';

interface UploadedFile {
    mimetype: string;
    file: Readable;
}

const textToHtmlParagraphs = (text: string): string => {
    return text
        .split('\n')
        .map((line: string) => `<p>${line}</p>`)
        .join('');
};

export const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
};

export const extractFileContent = async (file: UploadedFile): Promise<string> => {
    const { mimetype, file: fileStream } = file;
    const fileBuffer = await streamToBuffer(fileStream);

    if (!fileBuffer.length) {
        throw new Error('Empty file! Please upload a valid file.');
    }

    let htmlContent = '';

    if (mimetype === 'application/pdf') {
        const pdfData = await pdfParse(fileBuffer);
        htmlContent = textToHtmlParagraphs(pdfData.text);
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const { value: text } = await mammoth.extractRawText({ buffer: fileBuffer });
        htmlContent = textToHtmlParagraphs(text);
    } else if (mimetype === 'text/plain') {
        const text = fileBuffer.toString();
        htmlContent = textToHtmlParagraphs(text);
    } else {
        throw new Error('Unsupported file type! Please upload a PDF, DOCX, or TXT file.');
    }

    return htmlContent;
};
