# Use the official Node.js 16 image as the base
FROM node:16

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or yarn.lock) to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your bot's source code to the working directory
COPY . .

# Start the bot
CMD ["npm", "start"]
