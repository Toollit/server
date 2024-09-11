# 🚨 Precautions for Lambda use

## 1. Lambda installation precautions

###### If the module to be used for Lambda is not installed with the following command, the <u>lambda cannot find module 'sharp'</u> error occurs. The module should be installed according to the server on which Lambda will run.

```
$ rm -rf node_modules/sharp

$ npm install --platform=linux --arch=x64
```

## 2. Compress the module to be used in Lambda.

```
$ zip -r function.zip .
```

## Reference

https://docs.aws.amazon.com/ko_kr/lambda/latest/dg/with-s3-tutorial.html#with-s3-example-prereqs
https://oliveyoung.tech/blog/2023-05-19/aws-lambda-resize/
