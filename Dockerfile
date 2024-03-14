# pull the Node.js Docker image
FROM node:20.11.1

# create the directory inside the container
WORKDIR /usr/src/app

# copy the package.json files from local machine to the workdir in container
COPY package*.json ./

# run npm install in local machine
RUN npm install --legacy-peer-deps

# copy the generated modules and all other files to the container
COPY . .

# build project
RUN npm run build

# app is running on port 4000 within the container, so need to expose it
EXPOSE 4000

# the command that starts our app
CMD ["npm", "run", "start"]