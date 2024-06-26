# pull the Node.js Docker image
FROM node:20.11.1-alpine3.19

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

# move uncompiled email template ejs file
RUN cp -r /usr/src/app/src/template /usr/src/app/dist/src

# app is running on port 4000 within the container, so need to expose it
EXPOSE 4000

# the command that db migration and starts our app
CMD ["sh", "-c", "npm run migration:prod;npm start"]
