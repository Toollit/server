<!-- lamda 모듈을 아래 명령어로 설치하지않으면  lambda cannot find module 'sharp' 오류가 발생한다. 람다가 실행될 서버에 맞춰서 모듈을 설치해줘야한다.-->

npm install --platform=linux --arch=x64

<!-- lambda-s3 폴더로 들어간 후 아래 명령어를 사용해서 압축한 파일을 업로드해야한다.  -->

zip -r function.zip .
