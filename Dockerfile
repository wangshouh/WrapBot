FROM oven/bun:1

# Create app directory
WORKDIR /usr/src/app

COPY package*.json ./

RUN bun install
COPY . . 

RUN bunx prisma generate

CMD [ "bun", "run", "index.ts" ]