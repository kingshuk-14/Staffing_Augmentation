FROM node:20-alpine

# Install Tesseract dependencies for OCR if needed
RUN apk add --no-cache tesseract-ocr tesseract-ocr-eng

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

# Ensure upload and sent_emails directories exist
RUN mkdir -p uploads sent_emails

EXPOSE 5000

CMD ["node", "server.js"]
