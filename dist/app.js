"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var post_1 = __importDefault(require("./routes/post"));
var app = (0, express_1.default)();
var port = 4000;
app.get('/', function (req, res, next) {
    res.send('Hello World!');
});
app.use('/post', post_1.default);
app.listen(port, function () {
    console.log("started server on 0.0.0.0:".concat(port, ", url: http://localhost:").concat(port));
});
